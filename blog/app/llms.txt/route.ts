import { createGET } from "next-llms-generator/route";

export const GET = createGET({
  generatorOptions: {
    siteUrl: 'http://localhost:3000',
    headerTitle: 'My Blog',
    enableRecursiveDiscovery: true,
    maxPages: 10
  }
});