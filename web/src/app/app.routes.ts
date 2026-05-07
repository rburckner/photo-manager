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
        loadComponent: () => import('./components/folders/folders').then((m) => m.FoldersComponent),
      },
      {
        path: 'albums',
        loadComponent: () => import('./components/albums/albums').then((m) => m.AlbumsComponent),
      },
      {
        path: 'map',
        loadComponent: () => import('./components/map/map').then((m) => m.MapComponent),
      },
      {
        path: 'search',
        loadComponent: () => import('./components/search/search').then((m) => m.SearchComponent),
      },
    ],
  },
];
