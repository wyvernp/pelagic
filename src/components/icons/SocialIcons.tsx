/**
 * Social Media Platform Icons
 * Official brand logos for social sharing platforms
 */

import React from 'react';

interface IconProps {
  size?: number;
  className?: string;
}

/**
 * Instagram Icon - Official gradient logo
 */
export const InstagramIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    className={className}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <radialGradient
        id="instagram-gradient"
        cx="30%"
        cy="107%"
        r="150%"
        fx="30%"
        fy="107%"
      >
        <stop offset="0%" stopColor="#FFDD55" />
        <stop offset="10%" stopColor="#FFDD55" />
        <stop offset="50%" stopColor="#FF543E" />
        <stop offset="100%" stopColor="#C837AB" />
      </radialGradient>
    </defs>
    <rect
      x="2"
      y="2"
      width="20"
      height="20"
      rx="5"
      fill="url(#instagram-gradient)"
    />
    <circle cx="12" cy="12" r="4" stroke="white" strokeWidth="2" fill="none" />
    <circle cx="17.5" cy="6.5" r="1.5" fill="white" />
  </svg>
);

/**
 * X (Twitter) Icon - Official X logo
 */
export const TwitterXIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    className={className}
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

/**
 * Facebook Icon - Official F logo
 */
export const FacebookIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    className={className}
    fill="#1877F2"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
  </svg>
);

/**
 * TikTok Icon - Official logo with characteristic colors
 */
export const TikTokIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    className={className}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* Cyan shadow */}
    <path
      d="M9.5 2.5h3v13a3 3 0 11-3-3V9.5a6 6 0 106 6V8c1.5 1 3 1.5 4.5 1.5V6.5c-2 0-3.5-1-4.5-2.5V2.5"
      fill="#25F4EE"
      transform="translate(-0.5, 0.5)"
    />
    {/* Magenta shadow */}
    <path
      d="M9.5 2.5h3v13a3 3 0 11-3-3V9.5a6 6 0 106 6V8c1.5 1 3 1.5 4.5 1.5V6.5c-2 0-3.5-1-4.5-2.5V2.5"
      fill="#FE2C55"
      transform="translate(0.5, -0.5)"
    />
    {/* Main shape */}
    <path
      d="M9.5 2.5h3v13a3 3 0 11-3-3V9.5a6 6 0 106 6V8c1.5 1 3 1.5 4.5 1.5V6.5c-2 0-3.5-1-4.5-2.5V2.5"
      fill="currentColor"
    />
  </svg>
);

/**
 * Clipboard/Copy Icon
 */
export const ClipboardIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    className={className}
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" />
  </svg>
);

/**
 * Save/Download Icon
 */
export const SaveFileIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    className={className}
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
  </svg>
);

/**
 * Share Icon (generic)
 */
export const ShareIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    className={className}
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z" />
  </svg>
);
