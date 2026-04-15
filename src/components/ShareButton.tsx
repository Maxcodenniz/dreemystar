import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Share2, Facebook, Twitter, MessageCircle, Linkedin, Link as LinkIcon, Check } from 'lucide-react';

interface ShareButtonProps {
  url: string;
  title: string;
  description?: string;
  imageUrl?: string;
  variant?: 'icon' | 'button' | 'dropdown';
  className?: string;
}

const DROPDOWN_Z = 9999;

const ShareButton: React.FC<ShareButtonProps> = ({ 
  url, 
  title, 
  description = '', 
  imageUrl = '',
  variant = 'dropdown',
  className = ''
}) => {
  const { t } = useTranslation();
  const [showDropdown, setShowDropdown] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showDropdown || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const dropdownWidth = 192;
    setDropdownPosition({
      top: rect.bottom + 8,
      left: Math.max(8, rect.right - dropdownWidth),
    });
  }, [showDropdown]);

  const getSiteUrl = () => {
    return import.meta.env.VITE_SITE_URL || window.location.origin;
  };

  const fullUrl = url.startsWith('http') ? url : `${getSiteUrl()}${url}`;
  const encodedUrl = encodeURIComponent(fullUrl);
  const encodedTitle = encodeURIComponent(title);
  const encodedDescription = encodeURIComponent(description);
  const encodedImage = encodeURIComponent(imageUrl);

  const shareToFacebook = () => {
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      '_blank',
      'width=600,height=400'
    );
    setShowDropdown(false);
  };

  const shareToTwitter = () => {
    const text = description ? `${title} - ${description}` : title;
    window.open(
      `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodeURIComponent(text)}`,
      '_blank',
      'width=600,height=400'
    );
    setShowDropdown(false);
  };

  const shareToWhatsApp = () => {
    const text = description ? `${title}\n\n${description}\n\n${fullUrl}` : `${title}\n\n${fullUrl}`;
    window.open(
      `https://wa.me/?text=${encodeURIComponent(text)}`,
      '_blank'
    );
    setShowDropdown(false);
  };

  const shareToLinkedIn = () => {
    window.open(
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
      '_blank',
      'width=600,height=400'
    );
    setShowDropdown(false);
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        setShowDropdown(false);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = fullUrl;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => {
          setCopied(false);
          setShowDropdown(false);
        }, 2000);
      } catch (fallbackErr) {
        console.error('Fallback copy failed:', fallbackErr);
      }
      document.body.removeChild(textArea);
    }
  };

  const shareOptions = [
    { 
      name: 'Facebook', 
      icon: Facebook, 
      color: 'text-blue-500 hover:bg-blue-500/10',
      action: shareToFacebook 
    },
    { 
      name: 'Twitter', 
      icon: Twitter, 
      color: 'text-sky-400 hover:bg-sky-500/10',
      action: shareToTwitter 
    },
    { 
      name: 'WhatsApp', 
      icon: MessageCircle, 
      color: 'text-green-500 hover:bg-green-500/10',
      action: shareToWhatsApp 
    },
    { 
      name: 'LinkedIn', 
      icon: Linkedin, 
      color: 'text-blue-600 hover:bg-blue-600/10',
      action: shareToLinkedIn 
    },
    { 
      name: copied ? 'Copied!' : 'Copy Link', 
      icon: copied ? Check : LinkIcon, 
      color: 'text-purple-400 hover:bg-purple-500/10',
      action: copyToClipboard 
    },
  ];

  const dropdownContent = showDropdown && typeof document !== 'undefined' && createPortal(
    <>
      <div
        className="fixed inset-0"
        style={{ zIndex: DROPDOWN_Z }}
        onClick={() => setShowDropdown(false)}
        aria-hidden="true"
      />
      <div
        className="fixed w-48 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden"
        style={{
          zIndex: DROPDOWN_Z + 1,
          top: dropdownPosition.top,
          left: dropdownPosition.left,
        }}
      >
        {shareOptions.map((option) => {
          const Icon = option.icon;
          return (
            <button
              key={option.name}
              onClick={option.action}
              className={`w-full flex items-center space-x-3 px-4 py-3 ${option.color} transition-colors duration-200 hover:bg-white/5 text-left`}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm font-medium">{option.name}</span>
            </button>
          );
        })}
      </div>
    </>,
    document.body
  );

  if (variant === 'icon') {
    return (
      <>
        <div ref={buttonRef} className={`relative ${className}`}>
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-white transition-all duration-300 hover:scale-110"
            aria-label={t('common.share')}
          >
            <Share2 className="w-5 h-5" />
          </button>
        </div>
        {dropdownContent}
      </>
    );
  }

  if (variant === 'button') {
    return (
      <>
        <div ref={buttonRef} className={`relative ${className}`}>
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white rounded-lg transition-all duration-300 hover:scale-105 shadow-md hover:shadow-lg border border-purple-400/50 font-semibold"
          >
            <Share2 className="w-4 h-4" />
            <span className="text-sm">{t('common.share')}</span>
          </button>
        </div>
        {dropdownContent}
      </>
    );
  }

  // Default: dropdown variant
  return (
    <>
      <div ref={buttonRef} className={`relative ${className}`}>
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-purple-600/20 to-pink-600/20 hover:from-purple-600/30 hover:to-pink-600/30 border border-purple-500/30 text-white rounded-lg transition-all duration-300 hover:scale-105 backdrop-blur-sm"
        >
          <Share2 className="w-4 h-4" />
          <span className="text-sm font-medium">{t('common.share')}</span>
        </button>
      </div>
      {dropdownContent}
    </>
  );
};

export default ShareButton;
