import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  FiSearch,
  FiClock,
  FiX,
  FiTag,
  FiStar,
  FiTrendingUp,
  FiUpload,
  FiChevronDown,
  FiHeart,
  FiShuffle,
  FiHome,
  FiArrowLeft,
} from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useLocation } from "react-router-dom";
import * as styles from "./SearchInput.module.scss";
import TagFilter from "../TagFilter";
import { useTagFilter } from "../../../context/TagFilterContext";
import { wsClient } from "../../../wsClient";
import { useIsMobile } from "../../../hooks/useIsMobile";

type ContentType =
  | "recommendations"
  | "search"
  | "popular"
  | "favorites"
  | "random";

interface SearchInputProps {
  onSearch: (query: string, type: ContentType) => void;
  className?: string;
}

interface Suggestion {
  id: number;
  title: string;
  thumbnail: string;
  pages: number;
}

const icon = (t: ContentType) =>
  t === "search" ? (
    <FiSearch />
  ) : t === "random" ? (
    <FiShuffle />
  ) : t === "popular" ? (
    <FiTrendingUp />
  ) : t === "favorites" ? (
    <FiStar />
  ) : (
    <FiHeart />
  );

const label = (t: ContentType) =>
  t === "recommendations"
    ? "Recommendations"
    : t === "popular"
    ? "Popular"
    : t === "favorites"
    ? "Favorites"
    : t === "random"
    ? "Random"
    : "Search";

const SearchInput: React.FC<SearchInputProps> = ({
  onSearch,
  className = "",
}) => {
  const isMobile = useIsMobile(900);
  const navigate = useNavigate();
  const location = useLocation();
  const qs = new URLSearchParams(location.search);
  const { selectedTags } = useTagFilter();

  const [query, setQuery] = useState("");
  const [type, setType] = useState<ContentType>(
    (qs.get("type") as ContentType) || "search"
  );
  const [history, setHistory] = useState<string[]>(() =>
    JSON.parse(localStorage.getItem("searchHistory") || "[]")
  );
  const [results, setResults] = useState<Suggestion[]>([]);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [showTypes, setShowTypes] = useState(false);
  const [focused, setFocused] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const debRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("searchHistory");
    if (stored) setHistory(JSON.parse(stored));
  }, []);

  useEffect(() => {
    if (query.trim() || selectedTags.length > 0) {
      onSearch(query, type);
    }
  }, [selectedTags, type, query, onSearch]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!formRef.current?.contains(e.target as Node)) {
        setShowTypes(false);
        setFocused(false);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, []);

  const fetchSuggestions = useCallback(
    (q: string) => {
      if (!q.trim() && selectedTags.length === 0) {
        setResults([]);
        return;
      }
      const unsub = wsClient.subscribe((msg) => {
        if (msg.type === "search-results-reply") {
          const list = (msg.books || []).slice(0, 6).map((b: any) => ({
            id: b.id,
            title: b.title?.pretty || b.title?.english || "",
            thumbnail: b.thumbnail,
            pages: b.pagesCount,
          }));
          setResults(list);
          unsub();
        }
      });
      wsClient.send({
        type: "search-books",
        query: q,
        page: 1,
        perPage: 6,
        sort: "",
        filterTags: selectedTags,
        contentType: "search",
      });
    },
    [selectedTags]
  );

  useEffect(() => {
    if (debRef.current) clearTimeout(debRef.current);
    if (type !== "search") {
      setResults([]);
      return;
    }
    debRef.current = setTimeout(() => fetchSuggestions(query), 800);
    return () => debRef.current && clearTimeout(debRef.current);
  }, [query, selectedTags, type, fetchSuggestions]);

  const addHistory = (q: string) => {
    const upd = [
      q,
      ...history.filter((h) => h.toLowerCase() !== q.toLowerCase()),
    ].slice(0, 100);
    setHistory(upd);
    localStorage.setItem("searchHistory", JSON.stringify(upd));
  };

  const clearDropdown = () => {
    setShowTypes(false);
  };

  const executeSearch = (q: string, saveHist = true) => {
    const trimmed = q.trim();
    setQuery(trimmed);
    if (saveHist && trimmed) addHistory(trimmed);
    navigate(`/search?q=${encodeURIComponent(trimmed)}&type=search&page=1`);
    onSearch(trimmed, "search");
    fetchSuggestions(trimmed);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed === "") return;
    if (/^\d+$/.test(trimmed)) {
      clearDropdown();
      setFocused(false);
      navigate(`/book/${trimmed}`);
      return;
    }
    executeSearch(trimmed);
    setShowTypes(false);
    setFocused(false);
    inputRef.current?.blur();
  };

  const openRandom = () => {
    clearDropdown();
    setQuery("");
    setResults([]);
    wsClient.once("random-book-reply", (msg) => {
      if (msg.id) navigate(`/book/${msg.id}`);
    });
    wsClient.send({ type: "get-random-book" });
  };

  const qLower = query.trim().toLowerCase();
  const histList = qLower
    ? history.filter((h) => h.toLowerCase().includes(qLower))
    : history;
  const showDropdown =
    focused && type === "search" && (results.length || histList.length);

  const onBookPage = location.pathname.startsWith("/book/");
  const hasQueryInUrl = !!qs.get("q");
  const showBackBtn = onBookPage || hasQueryInUrl;

  const navigateToMainSearch = () => {
    const basePath = `/search?type=${type}`;
    const queryParam = hasQueryInUrl
      ? `&q=${encodeURIComponent(qs.get("q") || "")}`
      : "";
    navigate(`${basePath}${queryParam}&page=1`);
  };

  const canGoBack = () => window.history.length > 1;

  return (
    <form
      ref={formRef}
      className={`${styles.searchForm} ${className}`}
      onSubmit={handleSubmit}
    >
      {showBackBtn && !showDropdown && (
        <button
          type="button"
          className={styles.mobileBack}
          onClick={canGoBack() ? () => navigate(-1) : navigateToMainSearch}
        >
          {canGoBack() ? <FiArrowLeft /> : <FiHome />}
        </button>
      )}

      {showDropdown && (
        <button type="button" className={styles.mobileBack}>
          <FiX />
        </button>
      )}

      <div className={styles.searchContainer}>
        <div className={styles.inputWrapper}>
          <FiSearch className={styles.searchIcon} />
          <input
            ref={inputRef}
            value={query}
            disabled={type !== "search"}
            placeholder={
              type === "search" ? "Search by title or ID…" : label(type)
            }
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              setTimeout(clearDropdown, 100);
            }}
            className={styles.searchInput}
          />
        </div>

        <div className={styles.controlsContainer}>
          <div
            className={styles.contentTypeSelect}
            onClick={() => setShowTypes(!showTypes)}
          >
            <div className={styles.selectedContentType}>
              {icon(type)}
              <span className={styles.badgeContainer}>
                {label(type)}
                {type === "recommendations" && (
                  <span className={styles.betaBadge}>BETA</span>
                )}
              </span>
              <FiChevronDown
                className={`${styles.chevron} ${
                  showTypes ? styles.rotated : ""
                }`}
              />
            </div>

            <AnimatePresence>
              {showTypes && (
                <motion.div
                  className={styles.contentTypeDropdown}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.15 }}
                >
                  {(
                    [
                      "recommendations",
                      "search",
                      "popular",
                      "favorites",
                      "random",
                    ] as ContentType[]
                  ).map((t) => (
                    <div
                      key={t}
                      className={`${styles.contentTypeOption} ${
                        type === t ? styles.active : ""
                      }`}
                      onClick={() => {
                        if (t === "random") {
                          openRandom();
                          return;
                        }
                        setType(t);
                        clearDropdown();
                        setQuery("");
                        navigate(`/search?type=${t}`);
                        onSearch("", t);
                      }}
                    >
                      {icon(t)}
                      <span className={styles.badgeContainer}>
                        {label(t)}
                        {t === "recommendations" && (
                          <span className={styles.betaBadge}>BETA</span>
                        )}
                      </span>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <motion.button
            type="button"
            className={styles.tagsButton}
            whileHover={{ scale: 1 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setTagsOpen(true)}
          >
            <FiTag />
            {!isMobile && <span>{selectedTags.length}</span>}
            {isMobile && selectedTags.length > 0 && (
              <span className={styles.mobileTagBadge}>
                {selectedTags.length}
              </span>
            )}
          </motion.button>
        </div>

        {/* принудительный remount TagFilter по ключу selectedTags */}
        <TagFilter
          key={selectedTags.map((t) => t.id).join(",")}
          isOpen={tagsOpen}
          onClose={() => setTagsOpen(false)}
        />

        <AnimatePresence>
          {showDropdown && (
            <motion.div
              className={styles.unifiedDropdown}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
            >
              {histList.length > 0 && (
                <>
                  {/* History */}
                  <div className={styles.sectionHeaderRow}>
                    <span>History</span>
                    <button
                      type="submit"
                      style={{
                        position: "absolute",
                        left: "-9999px",
                        width: "1px",
                        height: "1px",
                        overflow: "hidden",
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        handleSubmit(e);
                      }}
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setHistory([]);
                        localStorage.removeItem("searchHistory");
                      }}
                    >
                      clear
                    </button>
                  </div>
                  {histList.map((h) => (
                    <div key={h} className={styles.historyRow}>
                      <button
                        type="button"
                        className={styles.historyRowButton}
                        onClick={() => executeSearch(h)}
                      >
                        <FiClock size={14} />
                        <span>{h}</span>
                      </button>
                      <button
                        type="button"
                        className={styles.removeBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          const upd = history.filter((x) => x !== h);
                          setHistory(upd);
                          localStorage.setItem(
                            "searchHistory",
                            JSON.stringify(upd)
                          );
                        }}
                      >
                        <FiX size={12} />
                      </button>
                    </div>
                  ))}
                </>
              )}

              {results.length > 0 && (
                <>
                  {/* Suggestions */}
                  <div className={styles.sectionHeader}>Results</div>
                  {results.map((r) => (
                    <div
                      key={r.id}
                      className={styles.resultRow}
                      onClick={() => {
                        executeSearch(r.title);
                        navigate(`/book/${r.id}`);
                      }}
                    >
                      <img
                        src={r.thumbnail}
                        alt={r.title}
                        className={styles.thumb}
                      />
                      <div className={styles.resultMeta}>
                        <span>{r.title}</span>
                        <span className={styles.light}>{r.pages} pages</span>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </form>
  );
};

export default SearchInput;
