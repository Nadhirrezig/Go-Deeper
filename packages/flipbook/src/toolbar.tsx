import { memo } from "react";
import type { ReactNode } from "react";
import {
  IconExitFullscreen,
  IconFullscreen,
  IconNext,
  IconPrevious,
  IconSoundOff,
  IconSoundOn,
  IconThumbnails,
  IconZoomIn,
  IconZoomOut,
} from "./icons";
import type { FlipbookLabels } from "./labels";
import { PageIndicator } from "./page-indicator";
import type { Spread } from "./spread";

interface ToolbarButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** Set for toggle buttons. */
  pressed?: boolean;
  children: ReactNode;
}

function ToolbarButton({ label, onClick, disabled, pressed, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      className="vgf-button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export interface ToolbarProps {
  labels: FlipbookLabels;
  spread: Spread;
  pageCount: number;
  /** False until the book can be flipped, and while the zoom is open. */
  canFlip: boolean;
  ready: boolean;
  zoomed: boolean;
  canZoomIn: boolean;
  thumbnailsOpen: boolean;
  fullscreen: boolean;
  soundOn: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onJump: (page: number) => void;
  onToggleThumbnails: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onToggleFullscreen: () => void;
  onToggleSound: () => void;
}

export const Toolbar = memo(function Toolbar(props: ToolbarProps) {
  const { labels, spread, pageCount } = props;
  return (
    <div className="vgf-toolbar" role="toolbar" aria-label={labels.toolbar}>
      <div className="vgf-toolbar-group">
        <ToolbarButton
          label={labels.previous}
          onClick={props.onPrevious}
          disabled={!props.canFlip || spread[0] <= 1}
        >
          <IconPrevious />
        </ToolbarButton>
        <PageIndicator
          spread={spread}
          pageCount={pageCount}
          label={labels.pageInput}
          disabled={!props.canFlip}
          onJump={props.onJump}
        />
        <ToolbarButton
          label={labels.next}
          onClick={props.onNext}
          disabled={!props.canFlip || spread[1] >= pageCount}
        >
          <IconNext />
        </ToolbarButton>
      </div>

      <div className="vgf-toolbar-group">
        <ToolbarButton
          label={labels.thumbnails}
          onClick={props.onToggleThumbnails}
          pressed={props.thumbnailsOpen}
          disabled={!props.canFlip}
        >
          <IconThumbnails />
        </ToolbarButton>
        <ToolbarButton
          label={labels.zoomOut}
          onClick={props.onZoomOut}
          disabled={!props.ready || !props.zoomed}
        >
          <IconZoomOut />
        </ToolbarButton>
        <ToolbarButton
          label={labels.zoomIn}
          onClick={props.onZoomIn}
          disabled={!props.ready || !props.canZoomIn}
        >
          <IconZoomIn />
        </ToolbarButton>

        {/* Step 4 slot: Search button goes here. */}
        <span className="vgf-toolbar-slot" data-slot="search" />
        {/* Step 4 slot: PDF download button goes here. */}
        <span className="vgf-toolbar-slot" data-slot="download" />

        <ToolbarButton
          label={props.fullscreen ? labels.exitFullscreen : labels.fullscreen}
          onClick={props.onToggleFullscreen}
          pressed={props.fullscreen}
        >
          {props.fullscreen ? <IconExitFullscreen /> : <IconFullscreen />}
        </ToolbarButton>
        <ToolbarButton
          label={props.soundOn ? labels.soundOff : labels.soundOn}
          onClick={props.onToggleSound}
          pressed={props.soundOn}
        >
          {props.soundOn ? <IconSoundOn /> : <IconSoundOff />}
        </ToolbarButton>
      </div>
    </div>
  );
});
