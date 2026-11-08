import next from "eslint-config-next";

const config = [
  ...next,
  { ignores: [".next/**", ".next-e2e/**", ".local/**", "node_modules/**", "test-results/**", "playwright-report/**"] },
];

export default config;
