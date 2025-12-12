import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { save, open } from '@tauri-apps/plugin-dialog';
import type { Trip, TripExport, SpeciesExport } from '../types';
import './ExportModal.css';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTrip?: Trip | null;
  selectedPhotoIds?: number[];
}

type ExportType = 'photos' | 'trip-report' | 'species-list';

export function ExportModal({ isOpen, onClose, selectedTrip, selectedPhotoIds = [] }: ExportModalProps) {
  const [exportType, setExportType] = useState<ExportType>('photos');
  const [includeProcessed, setIncludeProcessed] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [exportResult, setExportResult] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleExportPhotos = async () => {
    if (selectedPhotoIds.length === 0) {
      setExportResult('No photos selected');
      return;
    }

    try {
      setIsExporting(true);
      setExportResult(null);

      const folder = await open({
        directory: true,
        title: 'Select Export Destination',
      });

      if (!folder) {
        setIsExporting(false);
        return;
      }

      const exported = await invoke<string[]>('export_photos', {
        photoIds: selectedPhotoIds,
        destinationFolder: folder,
        includeProcessed,
      });

      setExportResult(`Successfully exported ${exported.length} photo${exported.length !== 1 ? 's' : ''}`);
    } catch (error) {
      console.error('Failed to export photos:', error);
      setExportResult(`Error: ${error}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportTripReport = async () => {
    if (!selectedTrip) {
      setExportResult('No trip selected');
      return;
    }

    try {
      setIsExporting(true);
      setExportResult(null);

      const tripExport = await invoke<TripExport>('get_trip_export', { tripId: selectedTrip.id });

      const filePath = await save({
        title: 'Save Trip Report',
        defaultPath: `${selectedTrip.name.replace(/[^a-zA-Z0-9]/g, '_')}_report.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });

      if (!filePath) {
        setIsExporting(false);
        return;
      }

      // Format the report nicely
      const report = {
        exportDate: new Date().toISOString(),
        trip: {
          name: tripExport.trip.name,
          location: tripExport.trip.location,
          resort: tripExport.trip.resort,
          startDate: tripExport.trip.date_start,
          endDate: tripExport.trip.date_end,
          notes: tripExport.trip.notes,
        },
        summary: {
          totalDives: tripExport.dives.length,
          totalPhotos: tripExport.photo_count,
          uniqueSpecies: tripExport.species_count,
          totalBottomTime: formatDuration(
            tripExport.dives.reduce((sum, d) => sum + d.dive.duration_seconds, 0)
          ),
          deepestDive: Math.max(...tripExport.dives.map(d => d.dive.max_depth_m)),
        },
        dives: tripExport.dives.map(d => ({
          diveNumber: d.dive.dive_number,
          date: d.dive.date,
          time: d.dive.time,
          duration: formatDuration(d.dive.duration_seconds),
          maxDepth: `${d.dive.max_depth_m.toFixed(1)}m`,
          waterTemp: d.dive.water_temp_c ? `${d.dive.water_temp_c}°C` : null,
          location: d.dive.location,
          buddy: d.dive.buddy,
          comments: d.dive.comments,
          photoCount: d.photo_count,
          species: d.species,
        })),
      };

      // Write file using fs plugin
      const { writeTextFile } = await import('@tauri-apps/plugin-fs');
      await writeTextFile(filePath, JSON.stringify(report, null, 2));

      setExportResult(`Trip report saved to ${filePath}`);
    } catch (error) {
      console.error('Failed to export trip report:', error);
      setExportResult(`Error: ${error}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportSpeciesList = async () => {
    try {
      setIsExporting(true);
      setExportResult(null);

      const species = await invoke<SpeciesExport[]>('get_species_export');

      const filePath = await save({
        title: 'Save Species List',
        defaultPath: 'species_list.csv',
        filters: [
          { name: 'CSV', extensions: ['csv'] },
          { name: 'JSON', extensions: ['json'] },
        ],
      });

      if (!filePath) {
        setIsExporting(false);
        return;
      }

      const { writeTextFile } = await import('@tauri-apps/plugin-fs');

      if (filePath.endsWith('.json')) {
        await writeTextFile(filePath, JSON.stringify(species, null, 2));
      } else {
        // CSV format
        const header = 'Name,Scientific Name,Category,Photo Count,Dive Count,Trip Count\n';
        const rows = species.map(s => 
          `"${s.name}","${s.scientific_name || ''}","${s.category || ''}",${s.photo_count},${s.dive_count},${s.trip_count}`
        ).join('\n');
        await writeTextFile(filePath, header + rows);
      }

      setExportResult(`Species list saved to ${filePath}`);
    } catch (error) {
      console.error('Failed to export species list:', error);
      setExportResult(`Error: ${error}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExport = () => {
    switch (exportType) {
      case 'photos':
        handleExportPhotos();
        break;
      case 'trip-report':
        handleExportTripReport();
        break;
      case 'species-list':
        handleExportSpeciesList();
        break;
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal export-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Export</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <div className="export-type-selection">
            <label className={`export-type-option ${exportType === 'photos' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="exportType"
                value="photos"
                checked={exportType === 'photos'}
                onChange={() => setExportType('photos')}
              />
              <div className="export-type-icon">
                <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32">
                  <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
                </svg>
              </div>
              <div className="export-type-info">
                <span className="export-type-name">Export Photos</span>
                <span className="export-type-desc">Copy selected photos to a folder</span>
              </div>
            </label>

            <label className={`export-type-option ${exportType === 'trip-report' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="exportType"
                value="trip-report"
                checked={exportType === 'trip-report'}
                onChange={() => setExportType('trip-report')}
              />
              <div className="export-type-icon">
                <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32">
                  <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
                </svg>
              </div>
              <div className="export-type-info">
                <span className="export-type-name">Trip Report</span>
                <span className="export-type-desc">Export trip details as JSON</span>
              </div>
            </label>

            <label className={`export-type-option ${exportType === 'species-list' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="exportType"
                value="species-list"
                checked={exportType === 'species-list'}
                onChange={() => setExportType('species-list')}
              />
              <div className="export-type-icon">
                <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32">
                  <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/>
                </svg>
              </div>
              <div className="export-type-info">
                <span className="export-type-name">Species List</span>
                <span className="export-type-desc">Export all species as CSV/JSON</span>
              </div>
            </label>
          </div>

          {exportType === 'photos' && (
            <div className="export-options">
              <div className="export-info">
                {selectedPhotoIds.length > 0 ? (
                  <span>{selectedPhotoIds.length} photo{selectedPhotoIds.length !== 1 ? 's' : ''} selected</span>
                ) : (
                  <span className="warning">No photos selected. Select photos in the grid first.</span>
                )}
              </div>
              <label className="checkbox-option">
                <input
                  type="checkbox"
                  checked={includeProcessed}
                  onChange={e => setIncludeProcessed(e.target.checked)}
                />
                Include processed versions
              </label>
            </div>
          )}

          {exportType === 'trip-report' && (
            <div className="export-options">
              {selectedTrip ? (
                <div className="export-info">
                  Exporting report for: <strong>{selectedTrip.name}</strong>
                </div>
              ) : (
                <div className="export-info warning">
                  No trip selected. Select a trip first.
                </div>
              )}
            </div>
          )}

          {exportResult && (
            <div className={`export-result ${exportResult.startsWith('Error') ? 'error' : 'success'}`}>
              {exportResult}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
          <button 
            className="btn btn-primary" 
            onClick={handleExport}
            disabled={isExporting || 
              (exportType === 'photos' && selectedPhotoIds.length === 0) ||
              (exportType === 'trip-report' && !selectedTrip)
            }
          >
            {isExporting ? 'Exporting...' : 'Export'}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}
