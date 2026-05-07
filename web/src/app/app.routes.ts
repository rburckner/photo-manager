import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'timeline', pathMatch: 'full' },
  // TV slideshow — fullscreen, no shell
  {
    path: 'tv',
    loadComponent: () => import('./components/tv/tv').then((m) => m.TvComponent),
  },
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
        path: 'people',
        loadComponent: () => import('./components/people/people').then((m) => m.PeopleComponent),
      },
      {
        path: 'map',
        loadComponent: () => import('./components/map/map').then((m) => m.MapComponent),
      },
      {
        path: 'search',
        loadComponent: () => import('./components/search/search').then((m) => m.SearchComponent),
      },
      {
        path: 'favorites',
        loadComponent: () => import('./components/favorites/favorites').then((m) => m.FavoritesComponent),
      },
      {
        path: 'stats',
        loadComponent: () => import('./components/stats/stats').then((m) => m.StatsComponent),
      },
      {
        path: 'tags',
        loadComponent: () => import('./components/tags/tags').then((m) => m.TagsComponent),
      },
      {
        path: 'activity',
        loadComponent: () => import('./components/activity/activity').then((m) => m.ActivityComponent),
      },
      {
        path: 'help',
        loadComponent: () => import('./components/help/help').then((m) => m.HelpComponent),
      },
      {
        path: 'settings',
        loadComponent: () => import('./components/settings/settings').then((m) => m.SettingsComponent),
      },
      {
        path: 'hidden',
        loadComponent: () => import('./components/hidden/hidden').then((m) => m.HiddenComponent),
      },
      {
        path: 'fix-dates',
        loadComponent: () => import('./components/fix-dates/fix-dates').then((m) => m.FixDatesComponent),
      },
      {
        path: 'duplicates',
        loadComponent: () => import('./components/duplicates/duplicates').then((m) => m.DuplicatesComponent),
      },
      {
        path: 'trash',
        loadComponent: () => import('./components/trash/trash').then((m) => m.TrashComponent),
      },
    ],
  },
];
