import React, { memo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Music } from 'lucide-react';
import { Artist } from '../types';
import { getProfileBioDisplay } from '../utils/profileI18n';
import FollowButton from './FollowButton';
import SmartImage from './SmartImage';

interface ArtistCardProps {
  artist: Artist;
}

const ArtistCard: React.FC<ArtistCardProps> = memo(({ artist }) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || 'en';

  return (
    <Link to={`/artist/${artist.id}`} className="block group">
      <div className="relative h-full bg-gradient-to-br from-gray-900/80 via-gray-800/60 to-gray-900/80 backdrop-blur-xl rounded-2xl overflow-hidden border border-white/10 shadow-xl hover:shadow-2xl hover:shadow-purple-500/20 transition-all duration-500 hover:-translate-y-2 hover:scale-[1.02]">
        {/* Gradient Overlay on Hover */}
        <div className="absolute inset-0 bg-gradient-to-br from-purple-600/0 via-pink-600/0 to-cyan-600/0 group-hover:from-purple-600/10 group-hover:via-pink-600/10 group-hover:to-cyan-600/10 transition-all duration-500 z-0"></div>
        
        {/* Image Section - fixed height to avoid layout shift and reload flash */}
        <div className="relative h-64 overflow-hidden bg-gray-800/50">
          <SmartImage
            src={artist.imageUrl}
            alt={artist.name}
            variant="cardLandscape"
            containerClassName="absolute inset-0 w-full h-full"
            className="w-full h-full transition-transform duration-700 group-hover:scale-110"
            placeholderClassName="animate-pulse bg-gray-700/60"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent z-10 pointer-events-none" />
          
          {/* Upcoming Badge */}
          {artist.upcoming && (
            <div className="absolute top-3 right-3 z-20 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg backdrop-blur-sm border border-white/20">
              {t('common.upcoming')}
            </div>
          )}
          
          {/* Follow Button */}
          <div className="absolute top-3 left-3 z-20">
            <FollowButton artistId={artist.id} variant="compact" />
          </div>
          
          {/* Category Tags Overlay */}
          <div className="absolute bottom-0 left-0 right-0 p-4 z-10">
            <div className="flex flex-wrap gap-2">
              {artist.categories.slice(0, 3).map((category, index) => (
                <span 
                  key={index} 
                  className="backdrop-blur-md bg-gradient-to-r from-purple-600/80 to-pink-600/80 text-white text-xs font-semibold px-2.5 py-1 rounded-full border border-white/20 shadow-lg"
                >
                  {category}
                </span>
              ))}
              {artist.categories.length > 3 && (
                <span className="backdrop-blur-md bg-white/20 text-white text-xs font-semibold px-2.5 py-1 rounded-full border border-white/20">
                  +{artist.categories.length - 3}
                </span>
              )}
            </div>
          </div>
        </div>
        
        {/* Content Section */}
        <div className="p-5 relative z-10">
          <h3 className="font-bold text-xl mb-1.5 text-white group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-purple-300 group-hover:to-pink-300 transition-all duration-300">
            {artist.name}
          </h3>
          <p className="text-purple-400 font-semibold mb-3 flex items-center gap-2">
            <Music className="h-4 w-4" />
            {artist.genre}
          </p>
          
          <p className="text-gray-400 line-clamp-2 text-sm leading-relaxed">{getProfileBioDisplay(artist, locale, t('common.noBiographyAvailable'))}</p>
        </div>
      </div>
    </Link>
  );
});

ArtistCard.displayName = 'ArtistCard';

export default ArtistCard;