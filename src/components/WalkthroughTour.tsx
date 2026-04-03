import { useState, useEffect } from 'react';
import Joyride, { CallBackProps, STATUS, EVENTS, Step, Styles } from 'react-joyride';
import './WalkthroughTour.css';

interface WalkthroughTourProps {
  run: boolean;
  onComplete: () => void;
  onSkip: () => void;
}

// Custom step content components with animations
function WelcomeStepContent() {
  return (
    <div className="tour-content tour-content-welcome">
      <div className="tour-emoji-bounce">🤿</div>
      <h3>Welcome to Pelagic!</h3>
      <p>
        Let's take a quick tour to help you get started organizing your underwater photos.
      </p>
      <p className="tour-hint">This will only take a minute.</p>
    </div>
  );
}

function ImportDivesStepContent() {
  return (
    <div className="tour-content">
      <div className="tour-feature-highlight">
        <div className="tour-icon-pulse">
          <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32">
            <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
          </svg>
        </div>
      </div>
      <h3>Import Your Dives</h3>
      <p>
        Start by importing dives from your <strong>dive computer</strong> via Bluetooth/USB, 
        or import from <strong>dive log files</strong> (FIT, SSRF, XML).
      </p>
      <p className="tour-hint">
        This creates the timeline that your photos will be matched to.
      </p>
    </div>
  );
}

function SidebarStepContent() {
  return (
    <div className="tour-content">
      <h3>Navigate Your Trips</h3>
      <p>
        Your dive trips and dives appear here. <strong>Click</strong> a trip to expand it 
        and see your dives, or <strong>double-click</strong> to edit trip details.
      </p>
      <div className="tour-mini-demo">
        <div className="tour-demo-trip">
          <span className="tour-demo-chevron">▶</span>
          <span>📁 Maldives 2024</span>
        </div>
        <div className="tour-demo-dives">
          <div className="tour-demo-dive">🚇 Dive 1 - Fish Head</div>
          <div className="tour-demo-dive">🚇 Dive 2 - Manta Point</div>
        </div>
      </div>
    </div>
  );
}

function PhotoImportStepContent() {
  return (
    <div className="tour-content tour-content-photo">
      <h3>Import Your Photos</h3>
      <p>
        This is where the magic happens! Import photos from any folder.
      </p>
      
      <div className="tour-workflow-diagram">
        <div className="tour-workflow-step">
          <div className="tour-workflow-icon">📷</div>
          <div className="tour-workflow-label">Your Photos</div>
        </div>
        <div className="tour-workflow-arrow">→</div>
        <div className="tour-workflow-step">
          <div className="tour-workflow-icon tour-workflow-scan">🔍</div>
          <div className="tour-workflow-label">Scan Timestamps</div>
        </div>
        <div className="tour-workflow-arrow">→</div>
        <div className="tour-workflow-step">
          <div className="tour-workflow-icon tour-workflow-group">📊</div>
          <div className="tour-workflow-label">Group by Time</div>
        </div>
        <div className="tour-workflow-arrow">→</div>
        <div className="tour-workflow-step">
          <div className="tour-workflow-icon tour-workflow-match">✨</div>
          <div className="tour-workflow-label">Match to Dives</div>
        </div>
      </div>

      <div className="tour-features-list">
        <div className="tour-feature-item">
          <span className="tour-feature-badge raw">RAW</span>
          <span>Auto-detects RAW files (CR2, NEF, ARW...)</span>
        </div>
        <div className="tour-feature-item">
          <span className="tour-feature-badge time">⏱️</span>
          <span>Groups photos by time gaps between shots</span>
        </div>
        <div className="tour-feature-item">
          <span className="tour-feature-badge auto">🎯</span>
          <span>Automatically matches groups to your dives</span>
        </div>
      </div>
      
      <p className="tour-hint">
        <strong>Pro tip:</strong> Even if your camera's clock is wrong, Pelagic matches photos 
        by their order relative to your dives!
      </p>
    </div>
  );
}

function ContentGridStepContent() {
  return (
    <div className="tour-content">
      <h3>Browse & Tag Your Photos</h3>
      <p>
        Your photos appear here. <strong>Click</strong> to select, <strong>Shift+Click</strong> for 
        multiple, then use the toolbar to:
      </p>
      <div className="tour-actions-grid">
        <div className="tour-action-item">
          <span className="tour-action-icon">🐠</span>
          <span>Tag species</span>
        </div>
        <div className="tour-action-item">
          <span className="tour-action-icon">🤖</span>
          <span>AI identify</span>
        </div>
        <div className="tour-action-item">
          <span className="tour-action-icon">🏷️</span>
          <span>Add tags</span>
        </div>
        <div className="tour-action-item">
          <span className="tour-action-icon">⭐</span>
          <span>Rate photos</span>
        </div>
      </div>
    </div>
  );
}

function CitizenScienceStepContent() {
  return (
    <div className="tour-content tour-content-citizen-science">
      <h3>Citizen Science</h3>
      <p>
        Your dive photos can contribute to <strong>real scientific research</strong>.
        Submit your AI-identified sightings directly to iNaturalist.
      </p>

      <div className="tour-citizen-science-grid">
        <div className="tour-cs-card">
          <span className="tour-cs-icon">🌿</span>
          <span className="tour-cs-label">iNaturalist</span>
          <span className="tour-cs-desc">Contribute your sightings to science</span>
        </div>
      </div>

      <div className="tour-features-list">
        <div className="tour-feature-item">
          <span className="tour-feature-badge auto">🤖</span>
          <span>AI-identified species are enriched with <strong>IUCN conservation status</strong></span>
        </div>
      </div>

      <p className="tour-hint">
        Connect your iNaturalist account in Settings to get started.
      </p>
    </div>
  );
}

function CommunityStepContent() {
  return (
    <div className="tour-content tour-content-community">
      <h3>🌊 Community</h3>
      <p>
        Join the Pelagic community to <strong>discover</strong> and <strong>contribute</strong> dive site data worldwide.
      </p>

      <div className="tour-actions-grid">
        <div className="tour-action-item">
          <span className="tour-action-icon">🗺️</span>
          <span>Discover dive sites on an interactive map</span>
        </div>
        <div className="tour-action-item">
          <span className="tour-action-icon">🐠</span>
          <span>Browse species observed at every site</span>
        </div>
        <div className="tour-action-item">
          <span className="tour-action-icon">📍</span>
          <span>Share your dive sites &amp; observations</span>
        </div>
        <div className="tour-action-item">
          <span className="tour-action-icon">📊</span>
          <span>See depth ranges, sighting counts &amp; more</span>
        </div>
      </div>

      <p className="tour-hint">
        Sign up for free to start contributing. Your data syncs automatically when sharing is enabled.
      </p>
    </div>
  );
}

function SearchStepContent() {
  return (
    <div className="tour-content">
      <h3>Powerful Search</h3>
      <p>
        Find anything instantly! Search across trips, dives, species, locations, and tags.
      </p>
      <div className="tour-keyboard-hint">
        <kbd>Ctrl</kbd> + <kbd>K</kbd>
      </div>
    </div>
  );
}

function CompleteStepContent() {
  return (
    <div className="tour-content tour-content-complete">
      <div className="tour-emoji-celebrate">🎉</div>
      <h3>You're All Set!</h3>
      <p>
        You now know the basics. Explore the <strong>Statistics</strong>, <strong>Map</strong>, 
        and <strong>Export</strong> features when you're ready.
      </p>
      <p className="tour-hint">
        You can restart this tour anytime from Settings.
      </p>
    </div>
  );
}

const tourSteps: Step[] = [
  {
    target: '.header-brand',
    content: <WelcomeStepContent />,
    placement: 'bottom',
    disableBeacon: true,
    spotlightPadding: 20,
  },
  {
    target: '#import-dives-btn',
    content: <ImportDivesStepContent />,
    placement: 'bottom',
    disableBeacon: true,
    spotlightPadding: 8,
  },
  {
    target: '.sidebar',
    content: <SidebarStepContent />,
    placement: 'right',
    disableBeacon: true,
    spotlightPadding: 0,
  },
  {
    target: '#import-photos-btn',
    content: <PhotoImportStepContent />,
    placement: 'bottom',
    disableBeacon: true,
    spotlightPadding: 8,
  },
  {
    target: '.content',
    content: <ContentGridStepContent />,
    placement: 'center',
    disableBeacon: true,
    spotlightPadding: 0,
  },
  {
    target: '.panel',
    content: <CitizenScienceStepContent />,
    placement: 'left',
    disableBeacon: true,
    spotlightPadding: 0,
  },
  {
    target: '#community-btn',
    content: <CommunityStepContent />,
    placement: 'bottom',
    disableBeacon: true,
    spotlightPadding: 8,
  },
  {
    target: '#search-btn',
    content: <SearchStepContent />,
    placement: 'bottom',
    disableBeacon: true,
    spotlightPadding: 8,
  },
  {
    target: '.header-brand',
    content: <CompleteStepContent />,
    placement: 'bottom',
    disableBeacon: true,
    spotlightPadding: 20,
  },
];

// Custom styles to match Pelagic's dark theme
const tourStyles: Partial<Styles> = {
  options: {
    arrowColor: 'var(--bg-secondary, #1e2127)',
    backgroundColor: 'var(--bg-secondary, #1e2127)',
    overlayColor: 'rgba(0, 0, 0, 0.85)',
    primaryColor: 'var(--accent-color, #3b82f6)',
    textColor: 'var(--text-primary, #e4e4e7)',
    spotlightShadow: '0 0 20px rgba(59, 130, 246, 0.5)',
    zIndex: 10000,
  },
  tooltip: {
    borderRadius: '12px',
    padding: 0,
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1)',
  },
  tooltipContainer: {
    textAlign: 'left',
  },
  tooltipTitle: {
    fontSize: '18px',
    fontWeight: 600,
    marginBottom: '8px',
  },
  tooltipContent: {
    padding: '20px',
    fontSize: '14px',
    lineHeight: 1.6,
  },
  buttonNext: {
    backgroundColor: 'var(--accent-color, #3b82f6)',
    borderRadius: '8px',
    color: '#fff',
    fontSize: '14px',
    fontWeight: 500,
    padding: '10px 20px',
    outline: 'none',
    border: 'none',
  },
  buttonBack: {
    color: 'var(--text-secondary, #a1a1aa)',
    fontSize: '14px',
    marginRight: '8px',
  },
  buttonSkip: {
    color: 'var(--text-muted, #71717a)',
    fontSize: '13px',
  },
  buttonClose: {
    display: 'none',
  },
  spotlight: {
    borderRadius: '12px',
  },
  overlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
  },
};

export function WalkthroughTour({ run, onComplete, onSkip }: WalkthroughTourProps) {
  const [stepIndex, setStepIndex] = useState(0);

  // Reset step index when tour starts
  useEffect(() => {
    if (run) {
      setStepIndex(0);
    }
  }, [run]);

  const handleCallback = (data: CallBackProps) => {
    const { status, type, index } = data;

    // Update step index for controlled mode
    if (type === EVENTS.STEP_AFTER) {
      setStepIndex(index + 1);
    }

    // Handle tour completion
    if (status === STATUS.FINISHED) {
      onComplete();
    }
    
    // Handle tour skip
    if (status === STATUS.SKIPPED) {
      onSkip();
    }
  };

  return (
    <Joyride
      steps={tourSteps}
      run={run}
      stepIndex={stepIndex}
      continuous
      showProgress
      showSkipButton
      disableOverlayClose
      disableCloseOnEsc={false}
      hideCloseButton
      scrollToFirstStep
      spotlightClicks={false}
      styles={tourStyles}
      callback={handleCallback}
      locale={{
        back: 'Back',
        close: 'Close',
        last: 'Finish',
        next: 'Next',
        skip: 'Skip tour',
      }}
      floaterProps={{
        disableAnimation: false,
      }}
    />
  );
}
