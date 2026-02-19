/**
 * Types for the social media share card feature.
 * Share cards are generated images for sharing dives, trips, and photos
 * on social media platforms.
 */

import type { Area } from 'react-easy-crop';

// ── Platform Presets ──

export interface ShareCardPreset {
  id: string;
  name: string;
  platform: string;
  width: number;
  height: number;
  aspect: number;
  maxFileSizeMB: number;
}

// ── Layouts ──

/** A slot definition within a layout, specified as percentages of the card */
export interface LayoutSlot {
  /** Slot index */
  index: number;
  /** X position as fraction (0–1) */
  x: number;
  /** Y position as fraction (0–1) */
  y: number;
  /** Width as fraction (0–1) */
  width: number;
  /** Height as fraction (0–1) */
  height: number;
  /** Gap in pixels between slots */
  gap?: number;
}

export interface ShareCardLayout {
  id: string;
  name: string;
  /** Number of photo slots */
  slotCount: number;
  /** Slot definitions */
  slots: LayoutSlot[];
  /** Whether this layout has a dedicated stats/info overlay area */
  hasInfoPanel: boolean;
  /** Info panel position, if hasInfoPanel */
  infoPanel?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

// ── Photo Slot State ──

/** Represents a single photo placed in a card slot with crop/zoom info */
export interface PhotoSlotState {
  /** Photo ID from the database */
  photoId: number;
  /** File path for loading via Tauri */
  filePath: string;
  /** Loaded base64 data URL */
  dataUrl?: string;
  /** Crop position from react-easy-crop */
  crop: { x: number; y: number };
  /** Zoom level from react-easy-crop */
  zoom: number;
  /** The cropped area in pixels, for canvas export */
  croppedAreaPixels: Area | null;
}

// ── Card Theme ──

export type CardTheme = 'dark' | 'light' | 'ocean' | 'sunset' | 'minimal';

export interface CardThemeColors {
  background: string;
  cardBg: string;
  textPrimary: string;
  textSecondary: string;
  accent: string;
  overlayBg: string;
  tagBg: string;
  tagText: string;
  /** Gradient overlay on photos for text readability */
  photoGradient: string;
}

// ── Overlay Configuration ──

export interface OverlayConfig {
  showLocation: boolean;
  showDate: boolean;
  showDepth: boolean;
  showDuration: boolean;
  showTemp: boolean;
  showDiveNumber: boolean;
  showSpeciesTags: boolean;
  showGeneralTags: boolean;
  showDiveProfile: boolean;
  showWatermark: boolean;
  customText: string;
}

// ── Full Share Card Config ──

export interface ShareCardConfig {
  /** What type of content is being shared */
  shareType: 'dive' | 'trip' | 'photo';
  /** Platform preset */
  preset: ShareCardPreset;
  /** Layout selection */
  layout: ShareCardLayout;
  /** Photo slots with crop/zoom state */
  slots: PhotoSlotState[];
  /** Visual theme */
  theme: CardTheme;
  /** Overlay toggles */
  overlay: OverlayConfig;
  /** Contextual data for rendering stats */
  diveData?: {
    diveNumber?: number;
    date?: string;
    time?: string;
    maxDepthM?: number;
    meanDepthM?: number;
    durationSeconds?: number;
    waterTempC?: number;
    location?: string;
    siteName?: string;
    buddy?: string;
    isNightDive?: boolean;
    isBoatDive?: boolean;
  };
  tripData?: {
    name?: string;
    location?: string;
    dateStart?: string;
    dateEnd?: string;
    diveCount?: number;
    totalUnderwaterSeconds?: number;
    deepestDiveM?: number;
    speciesCount?: number;
  };
  speciesTags?: string[];
  generalTags?: string[];
  /** Dive profile sample data for mini chart */
  diveSamples?: { time: number; depth: number }[];
}

/** Available photos for the photo selector grid */
export interface SelectablePhoto {
  id: number;
  filePath: string;
  thumbnailPath?: string;
  filename: string;
  captureTime?: string;
  width?: number;
  height?: number;
  rating?: number;
}
