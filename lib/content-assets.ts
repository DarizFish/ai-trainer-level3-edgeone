import manifest from "@/data/content-assets.json";

// 三份公开题库的 URL。文件名由 scripts/generate-public-content.mjs 按内容哈希生成，
// 页面和加载器一律从这里取，不要再自己拼 `/content/theory-${version}.json`——手拼的
// 名字不含哈希，一旦改题忘了改 meta.json 的版本号，immutable 缓存会把旧题库留一年。
export type ContentAssets = {
  version: string;
  theory: string;
  practical: string;
  practicalCatalog: string;
};

export const contentAssets = manifest as ContentAssets;
