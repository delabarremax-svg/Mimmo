import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
afterEach(cleanup);

import { vi } from "vitest";
if (typeof window !== "undefined") window.scrollTo = vi.fn();
