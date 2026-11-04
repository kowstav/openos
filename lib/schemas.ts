import { z } from "zod";
export const BlueprintSchema = z.object({
  purpose: z.string(),
  summary: z.string(),
  capabilities: z.array(z.object({ name: z.string(), description: z.string() })).default([]),
  architecture: z.string().default(""),
  modules: z.array(z.object({ name: z.string(), role: z.string() })).default([]),
  inputs: z.array(z.string()).default([]),
  outputs: z.array(z.string()).default([]),
  runtime: z.array(z.string()).default([]),
  applications: z.array(z.string()).default([]),
  permissions: z.array(z.string()).default([]),
  licenseNotes: z.string().default(""),
  risks: z.array(z.string()).default([]),
  supported: z.boolean().default(false),
  supportReason: z.string().default(""),
  commercialAlternatives: z.array(z.object({ name: z.string(), note: z.string(), verified: z.boolean() })).default([]),
});
export type Blueprint = z.infer<typeof BlueprintSchema>;
export const AppBlueprintSchema = z.object({
  title: z.string(), description: z.string(),
  operations: z.array(z.string()).default([]),
  inputs: z.array(z.string()).default([]),
  outputs: z.array(z.string()).default([]),
  permissions: z.array(z.string()).default([]),
  plan: z.array(z.string()).default([]),
});
export type AppBlueprint = z.infer<typeof AppBlueprintSchema>;
