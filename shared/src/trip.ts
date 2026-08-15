import { z } from 'zod';
import { dateOnlySchema, emailSchema, timeZoneSchema } from './common';

/**
 * A trip is the shared unit — this app's equivalent of budget-app's ledger
 * (PLAN.md §4). These schemas are the contract for every write; the server
 * re-validates with them regardless of what the client already checked.
 */

export const tripRoles = ['owner', 'member'] as const;
export const tripRoleSchema = z.enum(tripRoles);
export type TripRole = z.infer<typeof tripRoleSchema>;

export const tripInputSchema = z
  .object({
    name: z.string().trim().min(1, 'Give the trip a name').max(120),
    destination: z.string().trim().max(200).optional(),
    /**
     * Trip-level bounds, anchored to `homeTimezone`. These exist for list sort
     * and upcoming/past bucketing only — never for event arithmetic, which
     * always goes through an event's own zone (PLAN.md §3).
     */
    startDate: dateOnlySchema,
    endDate: dateOnlySchema,
    homeTimezone: timeZoneSchema,
  })
  .refine((t) => t.endDate >= t.startDate, {
    message: 'The trip cannot end before it starts',
    // Reported on the field the user would fix.
    path: ['endDate'],
  });

export type TripInput = z.infer<typeof tripInputSchema>;

/** A PATCH may carry any subset, but an incoming date pair must still order. */
export const tripPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    destination: z.string().trim().max(200).nullable().optional(),
    startDate: dateOnlySchema.optional(),
    endDate: dateOnlySchema.optional(),
    homeTimezone: timeZoneSchema.optional(),
    /**
     * Optimistic concurrency: the `updatedAt` the client last saw. A mismatch
     * is a 409 rather than a silent overwrite — two members editing one trip is
     * a real case in a shared trip (PLAN.md §8).
     */
    expectedUpdatedAt: z.string().optional(),
  })
  .refine((t) => t.startDate === undefined || t.endDate === undefined || t.endDate >= t.startDate, {
    message: 'The trip cannot end before it starts',
    path: ['endDate'],
  });

export type TripPatch = z.infer<typeof tripPatchSchema>;

export const tripSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  destination: z.string().nullable(),
  startDate: dateOnlySchema,
  endDate: dateOnlySchema,
  homeTimezone: timeZoneSchema,
  role: tripRoleSchema,
  memberCount: z.number().int().positive(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type TripSummary = z.infer<typeof tripSummarySchema>;

export const inviteInputSchema = z.object({ email: emailSchema });
export type InviteInput = z.infer<typeof inviteInputSchema>;
