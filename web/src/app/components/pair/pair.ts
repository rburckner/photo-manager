import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { DeviceAuthService } from '../../services/device-auth.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-pair',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="pair-container">
      <h2>Pair this device</h2>

      @if (deviceAuth.isPaired()) {
        <div class="paired-status">
          <div class="status-line">&#10003; Paired as <strong>{{ deviceAuth.deviceName() }}</strong></div>
          <p class="hint">You can now upload photos from this device. To pair as a different device, unpair first.</p>
          <div class="actions">
            <a routerLink="/upload" class="btn-primary">Go to Upload</a>
            <button class="btn-secondary" (click)="unpair()">Unpair</button>
          </div>
        </div>
      } @else {
        <p class="hint">
          On a desktop browser, open the photo manager &rarr; Settings &rarr; Devices and click
          "Generate pairing code". Then enter the 6-digit code below.
        </p>
        <form (ngSubmit)="submit()" #f="ngForm">
          <label>
            <span>Pairing code</span>
            <input
              type="tel"
              inputmode="numeric"
              pattern="[0-9]{6}"
              maxlength="6"
              [(ngModel)]="code"
              name="code"
              placeholder="123456"
              class="code-input"
              autocomplete="one-time-code"
              required
              autofocus
            />
          </label>
          <label>
            <span>Device name</span>
            <input
              type="text"
              [(ngModel)]="deviceName"
              name="deviceName"
              placeholder="My phone"
              class="text-input"
              required
              maxlength="40"
            />
          </label>
          <button type="submit" class="btn-primary" [disabled]="working || code.length !== 6 || !deviceName.trim()">
            {{ working ? 'Pairing…' : 'Pair' }}
          </button>
        </form>
      }
    </div>
  `,
  styles: [`
    .pair-container {
      max-width: 420px;
      margin: 0 auto;
      padding: 24px 16px;
      color: #ddd;
    }
    h2 { margin: 0 0 12px; font-size: 1.3rem; }
    .hint { color: #888; font-size: 0.9rem; line-height: 1.5; }

    form { display: flex; flex-direction: column; gap: 12px; margin-top: 16px; }
    label { display: flex; flex-direction: column; gap: 6px; }
    label > span { font-size: 0.8rem; color: #aaa; }

    .code-input, .text-input {
      width: 100%;
      padding: 10px 12px;
      background: #1a1a1a;
      border: 1px solid #444;
      color: #ddd;
      border-radius: 6px;
      font-size: 1rem;
      box-sizing: border-box;
    }
    .code-input {
      font-family: monospace;
      font-size: 1.4rem;
      letter-spacing: 0.5em;
      text-align: center;
    }

    .btn-primary, .btn-secondary {
      padding: 10px 18px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.9rem;
      text-decoration: none;
      display: inline-block;
      text-align: center;
    }
    .btn-primary {
      background: #2a3a5a;
      border: 1px solid #3a5a8a;
      color: #fff;
      &:hover:not(:disabled) { background: #3a4a6a; }
      &:disabled { opacity: 0.5; cursor: not-allowed; }
    }
    .btn-secondary {
      background: #2a2a2a;
      border: 1px solid #444;
      color: #ccc;
      &:hover { background: #333; }
    }

    .paired-status { margin-top: 16px; }
    .status-line { color: #8c8; font-size: 1rem; margin-bottom: 8px; }
    .actions { display: flex; gap: 8px; margin-top: 16px; }
  `],
})
export class PairComponent {
  code = '';
  deviceName = '';
  working = false;

  constructor(
    public readonly deviceAuth: DeviceAuthService,
    private readonly api: ApiService,
    private readonly router: Router,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  submit(): void {
    if (this.working) return;
    this.working = true;
    this.api.pairDevice(this.code, this.deviceName.trim()).subscribe({
      next: (res) => {
        this.deviceAuth.setCredentials(res.api_key, res.device_name);
        this.toast.success(`Paired as ${res.device_name}`);
        this.working = false;
        this.cdr.detectChanges();
        void this.router.navigate(['/upload']);
      },
      error: (err: { error?: { error?: string } }) => {
        this.toast.error(err.error?.error ?? 'Pairing failed');
        this.working = false;
        this.cdr.detectChanges();
      },
    });
  }

  unpair(): void {
    if (!confirm('Unpair this device? You will need a new pairing code to upload again.')) return;
    this.deviceAuth.clear();
    this.toast.info('Device unpaired');
  }
}
