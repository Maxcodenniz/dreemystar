import React from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar } from 'lucide-react';

interface AddToCalendarButtonProps {
  title: string;
  description?: string;
  startDate: string;
  endDate?: string;
  location?: string;
  url?: string;
  variant?: 'default' | 'compact';
  className?: string;
}

const AddToCalendarButton: React.FC<AddToCalendarButtonProps> = ({
  title,
  description = '',
  startDate,
  endDate,
  location = '',
  url = '',
  variant = 'default',
  className = ''
}) => {
  const { t } = useTranslation();
  const formatDateForICS = (date: Date): string => {
    const t = date.getTime();
    if (!Number.isFinite(t)) {
      return new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    }
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };

  const generateICS = (): string => {
    const start = new Date(startDate);
    const startMs = start.getTime();
    const end = endDate
      ? new Date(endDate)
      : new Date((Number.isFinite(startMs) ? startMs : Date.now()) + 60 * 60 * 1000);
    
    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Dreemystar//Event//EN',
      'BEGIN:VEVENT',
      `DTSTART:${formatDateForICS(start)}`,
      `DTEND:${formatDateForICS(end)}`,
      `SUMMARY:${title}`,
      description ? `DESCRIPTION:${description.replace(/\n/g, '\\n')}` : '',
      location ? `LOCATION:${location}` : '',
      url ? `URL:${url}` : '',
      'END:VEVENT',
      'END:VCALENDAR'
    ].filter(Boolean).join('\r\n');

    return icsContent;
  };

  const handleAddToCalendar = () => {
    const icsContent = generateICS();
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${title.replace(/[^a-z0-9]/gi, '_')}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  };

  if (variant === 'compact') {
    return (
      <button
        onClick={handleAddToCalendar}
        className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg font-semibold transition-all duration-300 shadow-md hover:shadow-lg bg-gradient-to-r from-blue-500 to-cyan-500 text-white border border-blue-400/50 hover:from-blue-600 hover:to-cyan-600 ${className}`}
      >
        <Calendar className="w-4 h-4" />
        <span className="text-sm">{t('common.calendar')}</span>
      </button>
    );
  }

  return (
    <button
      onClick={handleAddToCalendar}
      className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-semibold transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105 bg-gradient-to-r from-blue-600/20 to-cyan-600/20 border border-blue-500/30 text-blue-300 hover:from-blue-600/30 hover:to-cyan-600/30 ${className}`}
    >
      <Calendar className="w-4 h-4" />
      <span>{t('common.addToCalendar')}</span>
    </button>
  );
};

export default AddToCalendarButton;
