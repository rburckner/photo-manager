import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'timeline', pathMatch: 'full' },
  {
    path: '',
    loadComponent: () => import('./components/shell/shell').then((m) => m.ShellComponent),
    children: [
      {
        path: 'timeline',
        loadComponent: () => import('./components/timeline/timeline').then((m) => m.TimelineComponent),
      },
      {
        path: 'folders',
        loadComponent: () => import('./components/timeline/timeline').then((m) => m.TimelineComponent), // placeholder
      },
      {
        path: 'albums',
        loadComponent: () => import('./components/timeline/timeline').then((m) => m.TimelineComponent), // placeholder
      },
    ],
  },
];
