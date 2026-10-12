import type { Property } from "../domain/property";
// Implement only on a trusted backend. No browser secret or placeholder session.
export interface IdentityService {
  requireUser(): Promise<{ id: string }>;
}
export interface PropertyRepository {
  list(): Promise<Property[]>;
  save(property: Property): Promise<void>;
}
export interface DocumentService {
  createUpload(propertyId: string): Promise<{ url: string; expiresAt: string }>;
}
export interface ListingExtractor {
  extract(
    url: string,
  ): Promise<{ facts: Property["facts"]; retrievedAt: string }>;
}
export interface AnalysisService {
  request(propertyId: string): Promise<{ jobId: string }>;
}
export interface FinancialEngine {
  calculate(input: unknown): {
    version: string;
    assumptions: unknown;
    results: unknown;
  };
}
