import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { ToastService, Toast } from '../../services/toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast-container">
      @for (toast of toasts; track toast.id) {
        <div class="toast" [class]="'toast-' + toast.type" (click)="dismiss(toast.id)">
          {{ toast.message }}
        </div>
      }
    </div>
  `,
  styles: [`
    .toast-container {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 3000;
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-width: 360px;
    }

    .toast {
      padding: 10px 16px;
      border-radius: 8px;
      font-size: 0.85rem;
      cursor: pointer;
      animation: slideIn 0.2s ease;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    }

    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }

    .toast-success { background: #1a3a1a; border: 1px solid #2a5a2a; color: #8c8; }
    .toast-error { background: #3a1a1a; border: 1px solid #5a2a2a; color: #e88; }
    .toast-info { background: #1a2a3a; border: 1px solid #2a4a6a; color: #8ac; }
  `],
})
export class ToastComponent implements OnInit, OnDestroy {
  toasts: Toast[] = [];
  private sub?: Subscription;

  constructor(
    private readonly toastService: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.sub = this.toastService.toasts$.subscribe((t) => {
      this.toasts = t;
      this.cdr.detectChanges();
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  dismiss(id: number): void {
    this.toastService.dismiss(id);
  }
}
