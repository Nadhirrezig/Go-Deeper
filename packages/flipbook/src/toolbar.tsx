import { memo } from "react";
import type { ReactNode, RefObject } from "react";
import {
  IconDownload,
  IconExitFullscreen,
  IconFullscreen,
  IconNext,
  IconPrevious,
  IconSearch,
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
  buttonRef?: RefObject<HTMLButtonElement | null>;
  children: ReactNode;
}

function ToolbarButton({
  label,
  onClick,
  disabled,
  pressed,
  buttonRef,
  children,
}: ToolbarButtonProps) {
  return (
    <button
      ref={buttonRef}
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
  /** Search button; hidden when null (`search={false}`). */
  search: {
    open: boolean;
    onToggle: () => void;
    buttonRef: RefObject<HTMLButtonElement | null>;
  } | null;
  /** Download link to the original PDF; hidden when null (`download={false}`). */
  download: { href: string; fileName: string } | null;
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

        {props.search && (
          <ToolbarButton
            label={labels.search}
            onClick={props.search.onToggle}
            pressed={props.search.open}
            disabled={!props.ready}
            buttonRef={props.search.buttonRef}
          >
            <IconSearch />
          </ToolbarButton>
        )}
        {props.download && (
          // A plain link: the browser streams the file itself (nothing loaded into memory).
          // `download` names the file, but browsers ignore it for cross-origin URLs, where
          // the server's Content-Disposition header decides (see CLAUDE.md, step 6 notes).
          <a
            className="vgf-button"
            href={props.download.href}
            download={props.download.fileName}
            aria-label={labels.download}
            title={labels.download}
          >
            <IconDownload />
          </a>
        )}

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
