import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface DeleteUserRequest {
  userId?: string;
  email?: string; // Optional: for orphan users not in profiles (look up auth user by email)
}

Deno.serve(async (req: Request) => {
  try {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { 
          status: 405, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Create Supabase client with service role key for admin operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify the requesting user is an admin
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Check if user is admin or super admin (only they can delete users)
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('user_type')
      .eq('id', user.id)
      .single();

    const isAdminOrSuperAdmin = profile?.user_type === 'global_admin' || profile?.user_type === 'super_admin';
    if (profileError || !isAdminOrSuperAdmin) {
      return new Response(
        JSON.stringify({ error: 'Insufficient permissions' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Normal admins: only allow delete when super admin has enabled it via app_config
    const isSuperAdminUser = profile?.user_type === 'super_admin';
    if (!isSuperAdminUser) {
      const { data: configRow } = await supabaseAdmin
        .from('app_config')
        .select('value')
        .eq('key', 'admin_user_delete_enabled')
        .maybeSingle();
      const enabled = configRow?.value === true || configRow?.value === 'true';
      if (!enabled) {
        return new Response(
          JSON.stringify({ error: 'Delete user is disabled for admins by super admin' }),
          {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
    }

    // Parse request body
    const { userId }: DeleteUserRequest = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'User ID is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Prevent admin from deleting themselves
    if (userId === user.id) {
      return new Response(
        JSON.stringify({ error: 'Cannot delete your own account' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Must delete profile and related data BEFORE auth user: profiles.id REFERENCES auth.users(id).
    // Deleting auth user first causes "Database error deleting user" (FK violation).

    // Delete all related data first (due to foreign key constraints).
    // Tables that reference auth.users(id) must be cleared before auth.admin.deleteUser().
    await supabaseAdmin.from('favorite_artists').delete().eq('user_id', userId);
    await supabaseAdmin.from('favorite_artists').delete().eq('artist_id', userId);
    await supabaseAdmin.from('tickets').delete().eq('user_id', userId);
    await supabaseAdmin.from('events').delete().eq('artist_id', userId);
    await supabaseAdmin.from('security_violations').delete().eq('user_id', userId);
    await supabaseAdmin.from('stream_access_logs').delete().eq('user_id', userId);
    await supabaseAdmin.from('user_bans').delete().eq('user_id', userId);
    await supabaseAdmin.from('user_bans').delete().eq('banned_by', userId);
    await supabaseAdmin.from('content_protection_logs').delete().eq('user_id', userId);
    await supabaseAdmin.from('artist_contract_invites').delete().eq('created_by', userId);
    // Must remove stripe_customers row before auth delete (FK: stripe_customers_user_id_fkey)
    const { error: stripeErr } = await supabaseAdmin.from('stripe_customers').delete().eq('user_id', userId);
    if (stripeErr) {
      console.error('Error deleting stripe_customers:', stripeErr);
      return new Response(
        JSON.stringify({ error: 'Failed to delete user data: ' + stripeErr.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    // artist_media has CASCADE so will be deleted automatically

    // Delete user profile (required before auth delete - profiles.id REFERENCES auth.users(id)).
    // For orphan users (auth exists, no profile) this affects 0 rows - that's OK.
    const { error: profileDeleteError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', userId);

    if (profileDeleteError) {
      console.error('Error deleting profile:', profileDeleteError);
      return new Response(
        JSON.stringify({ error: 'Failed to delete user profile: ' + profileDeleteError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Now safe to delete auth user (no FK from profiles anymore)
    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (authDeleteError) {
      console.error('Error deleting auth user:', authDeleteError);
      return new Response(
        JSON.stringify({ error: 'Failed to delete user authentication' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: 'User deleted successfully' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});