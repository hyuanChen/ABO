import { useState, useCallback } from "react";
import WikiHome from "./WikiHome";
import WikiView from "./WikiView";

export type WikiType = "intel" | "lit";
export type ViewMode = "pages" | "mindmap";

export default function Wiki() {
  const [wikiType, setWikiType] = useState<WikiType | null>(null);
  const [activePage, setActivePage] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("pages");

  const handleSelectWiki = useCallback((type: WikiType) => {
    setWikiType(type);
    setActivePage(null);
    setViewMode("pages");
  }, []);

  const handleBack = useCallback(() => {
    setWikiType(null);
    setActivePage(null);
    setViewMode("pages");
  }, []);

  const handleSelectPage = useCallback((slug: string) => {
    setActivePage(slug);
  }, []);

  const handleNavigateToPage = useCallback((slug: string) => {
    setActivePage(slug);
  }, []);

  // WikiHome: no wikiType selected
  if (wikiType === null) {
    return <WikiHome onSelectWiki={handleSelectWiki} />;
  }

  // WikiView: a wikiType is selected
  return (
    <WikiView
      wikiType={wikiType}
      activePage={activePage}
      viewMode={viewMode}
      onBack={handleBack}
      onSelectPage={handleSelectPage}
      onNavigateToPage={handleNavigateToPage}
      onSetViewMode={setViewMode}
    />
  );
}
