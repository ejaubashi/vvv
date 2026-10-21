import { defineConfig } from "vite";

// Relative assets also work at an immutable /<commit>/preview/ deployment URL.
export default defineConfig({ base: "./", build: { modulePreload: false } });
