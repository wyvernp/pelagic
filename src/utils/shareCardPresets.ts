/**
 * Share card presets, layouts, and theme definitions.
 * Based on February 2026 social media image specifications.
 */

import type {
  ShareCardPreset,
  ShareCardLayout,
  CardTheme,
  CardThemeColors,
  OverlayConfig,
} from '../types/shareCard';

// ── Platform Presets ──

export const SHARE_PRESETS: ShareCardPreset[] = [
  {
    id: 'instagram-post',
    name: 'Instagram Post',
    platform: 'instagram',
    width: 1080,
    height: 1350,
    aspect: 4 / 5,
    maxFileSizeMB: 8,
  },
  {
    id: 'instagram-story',
    name: 'Instagram Story',
    platform: 'instagram',
    width: 1080,
    height: 1920,
    aspect: 9 / 16,
    maxFileSizeMB: 8,
  },
  {
    id: 'facebook-linkedin',
    name: 'Facebook / LinkedIn',
    platform: 'facebook',
    width: 1200,
    height: 630,
    aspect: 1.91,
    maxFileSizeMB: 8,
  },
  {
    id: 'x-twitter',
    name: 'X / Twitter',
    platform: 'twitter',
    width: 1280,
    height: 720,
    aspect: 16 / 9,
    maxFileSizeMB: 5,
  },
  {
    id: 'square',
    name: 'Square',
    platform: 'universal',
    width: 1080,
    height: 1080,
    aspect: 1,
    maxFileSizeMB: 8,
  },
];

// ── Card Layouts ──
// Slot positions are defined as fractions (0–1) of the card dimensions.
// A small gap is applied between slots in the renderer.

const GAP = 0.01; // 1% gap between slots

export const SHARE_LAYOUTS: ShareCardLayout[] = [
  {
    id: 'single-hero',
    name: 'Single Photo',
    slotCount: 1,
    slots: [
      { index: 0, x: 0, y: 0, width: 1, height: 1 },
    ],
    hasInfoPanel: false,
  },
  {
    id: 'split-two',
    name: 'Split Two',
    slotCount: 2,
    slots: [
      { index: 0, x: 0, y: 0, width: 0.5 - GAP / 2, height: 1 },
      { index: 1, x: 0.5 + GAP / 2, y: 0, width: 0.5 - GAP / 2, height: 1 },
    ],
    hasInfoPanel: false,
  },
  {
    id: 'grid-three',
    name: '1 + 2 Grid',
    slotCount: 3,
    slots: [
      { index: 0, x: 0, y: 0, width: 1, height: 0.6 - GAP / 2 },
      { index: 1, x: 0, y: 0.6 + GAP / 2, width: 0.5 - GAP / 2, height: 0.4 - GAP / 2 },
      { index: 2, x: 0.5 + GAP / 2, y: 0.6 + GAP / 2, width: 0.5 - GAP / 2, height: 0.4 - GAP / 2 },
    ],
    hasInfoPanel: false,
  },
  {
    id: 'grid-four',
    name: '2×2 Grid',
    slotCount: 4,
    slots: [
      { index: 0, x: 0, y: 0, width: 0.5 - GAP / 2, height: 0.5 - GAP / 2 },
      { index: 1, x: 0.5 + GAP / 2, y: 0, width: 0.5 - GAP / 2, height: 0.5 - GAP / 2 },
      { index: 2, x: 0, y: 0.5 + GAP / 2, width: 0.5 - GAP / 2, height: 0.5 - GAP / 2 },
      { index: 3, x: 0.5 + GAP / 2, y: 0.5 + GAP / 2, width: 0.5 - GAP / 2, height: 0.5 - GAP / 2 },
    ],
    hasInfoPanel: false,
  },
  {
    id: 'trip-collage',
    name: 'Trip Summary',
    slotCount: 3,
    slots: [
      { index: 0, x: 0, y: 0, width: 0.6 - GAP / 2, height: 0.65 - GAP / 2 },
      { index: 1, x: 0.6 + GAP / 2, y: 0, width: 0.4 - GAP / 2, height: 0.325 - GAP / 4 },
      { index: 2, x: 0.6 + GAP / 2, y: 0.325 + GAP / 4, width: 0.4 - GAP / 2, height: 0.325 - GAP / 4 },
    ],
    hasInfoPanel: true,
    infoPanel: {
      x: 0,
      y: 0.65 + GAP / 2,
      width: 1,
      height: 0.35 - GAP / 2,
    },
  },
];

// ── Theme Colors ──

export const CARD_THEMES: Record<CardTheme, CardThemeColors> = {
  dark: {
    background: '#0a0a0a',
    cardBg: '#1a1a1a',
    textPrimary: '#ffffff',
    textSecondary: '#a0a0a0',
    accent: '#0099cc',
    overlayBg: 'rgba(0, 0, 0, 0.65)',
    tagBg: 'rgba(0, 153, 204, 0.3)',
    tagText: '#7dd3fc',
    photoGradient: 'linear-gradient(transparent 50%, rgba(0,0,0,0.8) 100%)',
  },
  light: {
    background: '#f5f5f5',
    cardBg: '#ffffff',
    textPrimary: '#1a1a1a',
    textSecondary: '#666666',
    accent: '#0077aa',
    overlayBg: 'rgba(255, 255, 255, 0.85)',
    tagBg: 'rgba(0, 119, 170, 0.15)',
    tagText: '#0077aa',
    photoGradient: 'linear-gradient(transparent 50%, rgba(255,255,255,0.9) 100%)',
  },
  ocean: {
    background: '#0c1929',
    cardBg: '#112240',
    textPrimary: '#e6f1ff',
    textSecondary: '#8892b0',
    accent: '#64ffda',
    overlayBg: 'rgba(12, 25, 41, 0.75)',
    tagBg: 'rgba(100, 255, 218, 0.15)',
    tagText: '#64ffda',
    photoGradient: 'linear-gradient(transparent 40%, rgba(12,25,41,0.85) 100%)',
  },
  sunset: {
    background: '#1a0a0a',
    cardBg: '#2d1515',
    textPrimary: '#ffe8d6',
    textSecondary: '#c09070',
    accent: '#ff6b35',
    overlayBg: 'rgba(26, 10, 10, 0.7)',
    tagBg: 'rgba(255, 107, 53, 0.2)',
    tagText: '#ffb088',
    photoGradient: 'linear-gradient(transparent 50%, rgba(26,10,10,0.85) 100%)',
  },
  minimal: {
    background: '#000000',
    cardBg: '#000000',
    textPrimary: '#ffffff',
    textSecondary: '#888888',
    accent: '#ffffff',
    overlayBg: 'rgba(0, 0, 0, 0.5)',
    tagBg: 'rgba(255, 255, 255, 0.15)',
    tagText: '#ffffff',
    photoGradient: 'linear-gradient(transparent 60%, rgba(0,0,0,0.7) 100%)',
  },
};

// ── Default Overlay Config ──

export const DEFAULT_OVERLAY: OverlayConfig = {
  showLocation: true,
  showDate: true,
  showDepth: true,
  showDuration: true,
  showTemp: true,
  showDiveNumber: true,
  showSpeciesTags: true,
  showGeneralTags: false,
  showDiveProfile: false,
  showWatermark: true,
  customText: '',
};
