import type { TimelineItem } from '@travel/shared';

/** The user's word for each kind — *stay*, never *lodging* (BRAND.md §8). */
export const KIND_LABEL: Record<TimelineItem['kind'], string> = {
  flight: 'Flight',
  lodging: 'Stay',
  activity: 'Activity',
};
