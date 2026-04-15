import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const TARGET_LOCALES = ["es", "fr"] as const;
type TargetLocale = (typeof TARGET_LOCALES)[number];

interface TranslateRequest {
  title: string;
  excerpt: string;
  content: string;
  author: string;
  targetLocales?: TargetLocale[];
}

interface TranslatedBlock {
  title: string;
  excerpt: string;
  content: string;
  author: string;
}

type Result = Record<TargetLocale, TranslatedBlock>;

/** MyMemory: free, no key. GET with q and langpair=en|es */
async function myMemoryTranslate(text: string, target: string): Promise<string> {
  if (!text?.trim()) return text;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|${target}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MyMemory ${res.status}`);
  const data = await res.json();
  const translated = data?.responseData?.translatedText;
  return typeof translated === "string" ? translated : text;
}

/** LibreTranslate: optional API key. Preserves HTML when format=html */
async function libreTranslate(
  text: string,
  target: string,
  format: "text" | "html",
  apiUrl: string,
  apiKey: string | null
): Promise<string> {
  if (!text?.trim()) return text;
  const body: Record<string, string> = {
    q: text,
    source: "en",
    target,
    format,
  };
  if (apiKey) body.api_key = apiKey;
  const res = await fetch(`${apiUrl.replace(/\/$/, "")}/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LibreTranslate ${res.status}: ${err}`);
  }
  const data = await res.json();
  const translated = data?.translatedText;
  return typeof translated === "string" ? translated : text;
}

/** Translate one field to one locale (MyMemory) */
async function translateFieldMyMemory(
  text: string,
  target: TargetLocale
): Promise<string> {
  return myMemoryTranslate(text, target);
}

/** Translate content in chunks (by paragraph) to avoid huge requests; rejoin with </p><p> */
function splitHtmlParagraphs(html: string): string[] {
  const trimmed = html.trim();
  if (!trimmed) return [];
  return trimmed.split(/<\/p>\s*<p>/gi).map((s) => s.replace(/^<p>/i, "").replace(/<\/p>$/i, ""));
}

function joinHtmlParagraphs(parts: string[]): string {
  return parts.map((p) => `<p>${p}</p>`).join("\n");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const body = (await req.json()) as TranslateRequest;
    const { title = "", excerpt = "", content = "", author = "", targetLocales } = body;
    const locales: TargetLocale[] = targetLocales?.length
      ? targetLocales.filter((l): l is TargetLocale => TARGET_LOCALES.includes(l))
      : [...TARGET_LOCALES];

    const libretranslateUrl = Deno.env.get("LIBRETRANSLATE_URL") || "https://libretranslate.com";
    const libretranslateKey = Deno.env.get("LIBRETRANSLATE_API_KEY");
    const useLibre =
      Boolean(libretranslateKey) ||
      (libretranslateUrl !== "https://libretranslate.com" && libretranslateUrl.length > 0);

    const result: Result = {} as Result;

    for (const locale of locales) {
      if (useLibre) {
        const [tTitle, tExcerpt, tContent, tAuthor] = await Promise.all([
          libreTranslate(title, locale, "text", libretranslateUrl, libretranslateKey),
          libreTranslate(excerpt, locale, "text", libretranslateUrl, libretranslateKey),
          libreTranslate(content, locale, "html", libretranslateUrl, libretranslateKey),
          libreTranslate(author, locale, "text", libretranslateUrl, libretranslateKey),
        ]);
        result[locale] = { title: tTitle, excerpt: tExcerpt, content: tContent, author: tAuthor };
      } else {
        const [tTitle, tExcerpt, tAuthor] = await Promise.all([
          translateFieldMyMemory(title, locale),
          translateFieldMyMemory(excerpt, locale),
          translateFieldMyMemory(author, locale),
        ]);
        let tContent: string;
        if (content.trim()) {
          const parts = splitHtmlParagraphs(content);
          const translated = await Promise.all(
            parts.map((p) => translateFieldMyMemory(p, locale))
          );
          tContent = joinHtmlParagraphs(translated);
        } else {
          tContent = content;
        }
        result[locale] = { title: tTitle, excerpt: tExcerpt, content: tContent, author: tAuthor };
      }
    }

    return new Response(JSON.stringify({ translations: result }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("translate-news-article error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Translation failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
