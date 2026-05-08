import { Component, inject } from '@angular/core';
import { ThumbnailSizeService } from '../../services/thumbnail-size.service';

@Component({
  selector: 'app-thumb-size-slider',
  standalone: true,
  template: `
    <div class="thumb-size-slider" [title]="'Thumbnail size: ' + svc.size() + 'px'">
      <span class="label">Size</span>
      <input
        type="range"
        [min]="svc.min"
        [max]="svc.max"
        [value]="svc.size()"
        (input)="onChange($event)"
        aria-label="Thumbnail size"
      />
    </div>
  `,
  styles: [`
    .thumb-size-slider {
      display: inline-flex;
      align-items: center;
      gap: 6px;

      .label {
        font-size: 0.75rem;
        color: #888;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      input[type=range] {
        width: 100px;
        accent-color: #3a7bd5;
        cursor: pointer;
      }
    }
  `],
})
export class ThumbSizeSliderComponent {
  readonly svc = inject(ThumbnailSizeService);

  onChange(event: Event): void {
    const v = parseInt((event.target as HTMLInputElement).value, 10);
    this.svc.set(v);
  }
}
