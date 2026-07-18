/**
 * Cinema coordinates Canvas layout, input and rendering.
 */
import { calculateCinemaLayout } from '../ui/canvas/CinemaLayout.js';
import { CinemaInputController } from '../ui/canvas/CinemaInputController.js';
import { CinemaRenderer } from '../ui/canvas/CinemaRenderer.js';

export class Cinema {
    constructor(canvas, seatData) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.sd = seatData;
        this.renderer = new CinemaRenderer({
            canvas,
            getSeatData: () => this.sd,
            getLayout: () => this.layout,
            getInteractionState: () => this.input?.state
        });
        this.input = new CinemaInputController({
            canvas,
            getLayout: () => this.layout,
            getSeatData: () => this.sd,
            onVisualChange: () => this.redraw(),
            onSelectionChange: () => {
                this.renderer.refreshHeat();
                this._emit();
            },
            onSeatActivated: (row, col) => this.renderer.triggerSeatBounce(row, col)
        });
        this.input.bind();
        this.relayout();
        this.redraw();
    }

    relayout() {
        const parentWidth = this.canvas.parentElement?.clientWidth || window.innerWidth - 32;
        const availableWidth = Math.min(parentWidth, window.innerWidth - 32);
        this.layout = calculateCinemaLayout({
            rows: this.sd.rows,
            cols: this.sd.cols,
            availableWidth,
            availableHeight: window.innerHeight - 200
        });
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.canvas.width = this.layout.displayWidth * dpr;
        this.canvas.height = this.layout.displayHeight * dpr;
        this.canvas.style.width = `${this.layout.displayWidth}px`;
        this.canvas.style.height = `${this.layout.displayHeight}px`;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.input.clampFocus();
        this.renderer.refreshHeat();
    }

    bindEvents() {
        this.input.bind();
    }

    _emit() {
        this.canvas.dispatchEvent(new CustomEvent('selectionChange', {
            detail: {
                selectedSeats: this.sd.getSelectedSeats(),
                stats: this.sd.getStats()
            }
        }));
    }

    redraw() {
        this.renderer.redraw();
    }

    setColorblindMode(enabled) {
        this.renderer.setColorblindMode(enabled);
    }

    reload() {
        this.relayout();
        this.redraw();
    }

    resize() {
        this.relayout();
        this.redraw();
    }
}
