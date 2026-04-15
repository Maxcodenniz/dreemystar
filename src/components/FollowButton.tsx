import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Heart } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useStore } from '../store/useStore';

interface FollowButtonProps {
  artistId: string;
  variant?: 'default' | 'compact';
  className?: string;
  onToggle?: (isFollowing: boolean) => void;
}

const FollowButton: React.FC<FollowButtonProps> = ({ 
  artistId, 
  variant = 'default',
  className = '',
  onToggle 
}) => {
  const { t } = useTranslation();
  const { user } = useStore();
  const [isLiked, setIsLiked] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user && artistId) {
      checkIfLiked();
    }
  }, [user, artistId]);

  const checkIfLiked = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('favorite_artists')
        .select('*')
        .eq('user_id', user.id)
        .eq('artist_id', artistId)
        .maybeSingle();

      if (error) throw error;
      setIsLiked(!!data);
    } catch (err) {
      console.error('Error checking favorite status:', err);
    }
  };

  const toggleLike = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    if (!user) {
      window.location.href = '/login';
      return;
    }

    try {
      setLoading(true);

      if (isLiked) {
        const { error } = await supabase
          .from('favorite_artists')
          .delete()
          .eq('user_id', user.id)
          .eq('artist_id', artistId);

        if (error) throw error;
        
        // Decrement likes
        await supabase.rpc('decrement_profile_likes', { artist_id: artistId });
        setIsLiked(false);
        onToggle?.(false);
      } else {
        const { error } = await supabase
          .from('favorite_artists')
          .insert({
            user_id: user.id,
            artist_id: artistId
          });

        if (error) throw error;
        
        // Increment likes
        await supabase.rpc('increment_profile_likes', { artist_id: artistId });
        setIsLiked(true);
        onToggle?.(true);
      }
    } catch (err) {
      console.error('Error toggling favorite:', err);
    } finally {
      setLoading(false);
    }
  };

  const compactButton = (
    <button
      onClick={!user ? () => window.location.href = '/login' : toggleLike}
      disabled={loading}
      className={`flex items-center justify-center space-x-1 px-3 py-1.5 rounded-lg font-semibold transition-all duration-300 shadow-md hover:shadow-lg ${
        isLiked 
          ? 'bg-gradient-to-r from-red-600 to-pink-600 text-white hover:from-red-700 hover:to-pink-700 border border-red-500/50' 
          : 'bg-violet-600 hover:bg-violet-700 text-white border border-violet-500'
      } ${className}`}
    >
      <Heart className={`w-4 h-4 ${isLiked ? 'fill-current' : ''} ${loading ? 'animate-pulse' : ''}`} />
      <span className="text-sm">{isLiked ? t('common.following') : t('common.follow')}</span>
    </button>
  );

  if (variant === 'compact') {
    return compactButton;
  }

  if (!user) {
    return (
      <button
        onClick={() => window.location.href = '/login'}
        className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-semibold transition-all duration-300 shadow-md hover:shadow-lg bg-violet-600 hover:bg-violet-700 text-white border border-violet-500 ${className}`}
      >
        <Heart className="w-4 h-4" />
        <span>{t('common.follow')}</span>
      </button>
    );
  }

  return (
    <button
      onClick={toggleLike}
      disabled={loading}
      className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-semibold transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105 ${
        isLiked 
          ? 'bg-gradient-to-r from-red-600 to-pink-600 text-white hover:from-red-700 hover:to-pink-700' 
          : 'bg-violet-600 hover:bg-violet-700 text-white border border-violet-500'
      } ${className}`}
    >
      <Heart className={`w-4 h-4 ${isLiked ? 'fill-current' : ''} ${loading ? 'animate-pulse' : ''}`} />
      <span>{isLiked ? t('common.following') : t('common.follow')}</span>
    </button>
  );
};

export default FollowButton;
