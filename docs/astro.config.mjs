import starlight from "@astrojs/starlight";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

export default defineConfig({
	site: "https://cogapplabs.github.io",
	base: "/search-api-elysia",
	integrations: [
		starlight({
			title: "Search API",
			customCss: ["./src/styles/tailwind.css"],
			social: [
				{
					icon: "github",
					label: "GitHub",
					href: "https://github.com/CogappLabs/search-api-elysia",
				},
			],
			sidebar: [
				{
					label: "Guides",
					items: [
						{ label: "Getting Started", slug: "guides/getting-started" },
						{ label: "Configuration", slug: "guides/configuration" },
						{ label: "Adding a Search Engine", slug: "guides/adding-an-engine" },
					],
				},
				{
					label: "Features",
					items: [
						{ label: "Search", slug: "reference/search" },
						{ label: "Autocomplete", slug: "reference/autocomplete" },
						{ label: "Documents", slug: "reference/documents" },
						{ label: "Facets", slug: "reference/facets" },
						{ label: "Filters", slug: "features/filters" },
						{ label: "Histograms", slug: "features/histograms" },
						{ label: "Geo Map", slug: "features/geo-map" },
						{ label: "Field Aliases", slug: "features/field-aliases" },
						{ label: "Mapping", slug: "reference/mapping" },
						{ label: "Raw Query", slug: "reference/raw-query" },
						{ label: "InstantSearch", slug: "features/instantsearch" },
					{ label: "Eden Treaty Client", slug: "features/eden-client" },
					],
				},
			],
		}),
		react(),
	],
	vite: { plugins: [tailwindcss()] },
});
