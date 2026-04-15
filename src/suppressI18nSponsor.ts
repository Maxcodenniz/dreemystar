/**
 * i18next may log a sponsorship line (Locize) during init via `console.info`
 * (not only `console.log`). Import this module before `./i18n`. We also set
 * `showSupportNotice: false` in `i18n.ts` to disable it at the source.
 */
const shouldDropLocizeSponsor = (args: unknown[]) => {
  const first = args[0];
  return typeof first === 'string' && first.includes('locize.com');
};

const origLog = console.log.bind(console);
const origInfo = console.info.bind(console);

console.log = (...args: unknown[]) => {
  if (shouldDropLocizeSponsor(args)) return;
  origLog(...args);
};

console.info = (...args: unknown[]) => {
  if (shouldDropLocizeSponsor(args)) return;
  origInfo(...args);
};

export {};
