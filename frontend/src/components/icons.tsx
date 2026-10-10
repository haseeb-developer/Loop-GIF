type P = { className?: string };
const mk = (d: React.ReactNode) =>
  function Icon({ className = "h-4 w-4" }: P) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"
        strokeLinejoin="round" className={className} aria-hidden="true">{d}</svg>
    );
  };
export const CopyIcon = mk(<><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h8" /></>);
export const DownloadIcon = mk(<path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" />);
export const TrashIcon = mk(<path d="M4 7h16M10 11v6m4-6v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />);
export const SearchIcon = mk(<><circle cx="11" cy="11" r="6" /><path d="m20 20-4-4" /></>);
export const PlusIcon = mk(<path d="M12 5v14M5 12h14" />);
export const CheckIcon = mk(<path d="m5 12 5 5 9-10" />);
export const UploadIcon = mk(<path d="M12 16V5m0 0-4 4m4-4 4 4M5 20h14" />);
export const XIcon = mk(<path d="M6 6l12 12M18 6 6 18" />);
export const LogoutIcon = mk(<path d="M10 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4M15 8l4 4-4 4M19 12H9" />);
export const ShareIcon = mk(<><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="m8.2 10.8 7.6-4.6M8.2 13.2l7.6 4.6" /></>);
export const LinkIcon = mk(<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />);
export const EditIcon = mk(<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4ZM13.5 6.5l4 4" />);
export const PencilIcon = mk(<path d="M4 20l1-4L16 5a2.1 2.1 0 0 1 3 3L8 19l-4 1Z" />);
export const RefreshIcon = mk(<path d="M20 11a8 8 0 0 0-14.6-3.5M4 5v4h4M4 13a8 8 0 0 0 14.6 3.5M20 19v-4h-4" />);
export const MoreIcon = mk(<><circle cx="5" cy="12" r="1.2" fill="currentColor" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /><circle cx="19" cy="12" r="1.2" fill="currentColor" /></>);
export const ClockIcon = mk(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>);
export const FilmIcon = mk(<><rect x="3.5" y="4" width="17" height="16" rx="2" /><path d="M8 4v16M16 4v16M3.5 9h4.5M3.5 15h4.5M16 9h4.5M16 15h4.5" /></>);
export const PlayIcon = mk(<path d="M8 5.5v13l10.5-6.5L8 5.5Z" fill="currentColor" />);
export const PauseIcon = mk(<><rect x="7" y="5" width="3.5" height="14" rx="1" fill="currentColor" /><rect x="13.5" y="5" width="3.5" height="14" rx="1" fill="currentColor" /></>);
export const AlertIcon = mk(<><path d="M12 4 2.8 19.5h18.4L12 4Z" /><path d="M12 10v4.5M12 17.2v.1" /></>);
export const InfoIcon = mk(<><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 7.8v.1" /></>);
export const ExternalIcon = mk(<path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />);
export const ChevronLeftIcon = mk(<path d="m15 5-7 7 7 7" />);
export const ChevronDownIcon = mk(<path d="m5 9 7 7 7-7" />);
export const GridIcon = mk(<><rect x="4" y="4" width="6.5" height="6.5" rx="1.2" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.2" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.2" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.2" /></>);
export const ListIcon = mk(<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.1M4.5 12h.1M4.5 18h.1" />);
export const ZoomInIcon = mk(<><circle cx="11" cy="11" r="6" /><path d="m20 20-4-4M11 8.5v5M8.5 11h5" /></>);
export const FitIcon = mk(<path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4" />);
export const SkipStartIcon = mk(<path d="M6 5v14M18 6.5v11L9 12l9-5.5Z" />);
export const SkipEndIcon = mk(<path d="M18 5v14M6 6.5v11L15 12 6 6.5Z" />);
export const ScissorsIcon = mk(<><circle cx="6" cy="6.5" r="2.5" /><circle cx="6" cy="17.5" r="2.5" /><path d="m8 8 12 9M8 16 20 7" /></>);
export const UserIcon = mk(<><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></>);
export const CodeIcon = mk(<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14" />);
