# astro-content-loader

Load `.astro` files with the Astro Content Layer API, just as you would other formats (e.g., Markdown, MDX). Makes use of Vite's `import.meta.glob` to dynamically import `.astro` files as modules.

## Installation

```bash
npm install astro-content-loader
```

## Why?

`.astro` files offer better type safety and code completion compared to Markdown and similar formats. This loader allows you to treat `.astro` files as content files, which means:

-  You can provide metadata and schemas for your content, similar to Markdown or MDX files.
-  Files can be located anywhere in your project, not just in `src/pages/`.

## Example usage

In your `content.config.ts` file, define and export your collection:

```ts
import { defineCollection, z } from "astro:content";
import astro from "astro-content-loader";

const posts = defineCollection({
  loader: astro({
    // Specify the path to your .astro content files
    // NOTE: Path must be *relative* to the src/ directory
    modules: import.meta.glob("./content/posts/**/*.astro"),
  }),
  // Optional: Define a schema for your content
  schema: z.object({
    title: z.string(),
    tags: z.array(z.string()).optional(),
  }),
});

export const collections = { posts };
```

Content files are standard `.astro` files, but you can also include metadata in the frontmatter by exporting a `meta` object:

```astro
---
// NOTE: Metadata must not reference external variables or imports
export const meta = {
  title: "My first post",
  tags: ["astro", "content-loader"],
}
---

<article>
  <p>This is my first post using the Astro Content Loader!</p>
</article>
```

Content files can be queried and rendered just like other content types. For example, to generate static routes for each page in a collection:

```astro
---
import Base from "../layouts/Base.astro";
import { getCollection, render } from "astro:content";

export function getStaticPaths() {
  const posts = await getCollection("posts");
  return posts.map((post) => ({
    params: { id: post.id },
    props: { entry: post },
  }));
}

const { entry } = Astro.props;
const { Content } = await render(entry);
---

<Base>
  <h1>{entry.data.title}</h1>
  <Content />
</Base>
```

See the [Astro content collection documentation](https://docs.astro.build/en/guides/content-collections/#building-for-static-output-default) for more details.

## Credit

-  Architecture based on Astro's built-in [`glob` loader](https://docs.astro.build/en/reference/content-loader-reference/#glob-loader) ([source](https://github.com/withastro/astro/blob/acb9b302f56e38833a1ab01147f7fde0bf967889/packages/astro/src/content/loaders/glob.ts#L59)).
