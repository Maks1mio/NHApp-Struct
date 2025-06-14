import React, { useCallback, useEffect, useState, useRef } from "react";
import * as styles from "./SearchResults.module.scss";
import BookCard, { Book } from "../BookCard";
import { wsClient } from "../../../wsClient";
import { useTagFilter } from "../../../context/TagFilterContext";
import MinimalHeader from "./MinimalHeader";
import { Loading, StateBlock } from "./SearchResultStates";
import { FiAlertCircle, FiChevronDown, FiChevronUp } from "react-icons/fi";

interface RecommendationDebugData {
  topChars: string[];
  topArts: string[];
  topTags: string[];
  favQueries: string[];
  tagQueries: string[];
  filterPart?: string;
  freq: Record<string, Record<string, number>>;
}

interface BookWithTags extends Book {
  explain?: string[];
  score?: number;
}

interface RecommendationDebugProps {
  debug: RecommendationDebugData | null;
  books: BookWithTags[];
}

interface Preferences {
  prioritizeRecency: boolean;
  prioritizeArtists: boolean;
  prioritizeCharacters: boolean;
  diversityLevel: number;
}

/* ---------- debug-панель ---------- */
const RecommendationDebug: React.FC<RecommendationDebugProps> = ({
  debug,
  books,
}) => {
  const [open, setOpen] = useState(false);
  if (!debug) return null;
  const renderPills = (arr: string[]) =>
    arr.slice(0, 6).map((n, i) => (
      <span key={i} className={styles.pill}>
        {n}
      </span>
    ));

  return (
    <div className={styles.debugBox}>
      <button className={styles.debugToggle} onClick={() => setOpen((o) => !o)}>
        <FiAlertCircle size={18} />
        <span>{open ? "Скрыть" : "Показать"} «Как это работает»</span>
        {open ? <FiChevronUp /> : <FiChevronDown />}
      </button>
      <div className={styles.briefRow}>
        {renderPills(debug.topChars)}
        {renderPills(debug.topArts)}
        {renderPills(debug.topTags)}
      </div>
      {open && (
        <div className={styles.details}>
          <h4>Алгоритм</h4>
          <section>
            <b>Топ-персонажи:</b> {renderPills(debug.topChars)}
          </section>
          <section>
            <b>Топ-артисты:</b> {renderPills(debug.topArts)}
          </section>
          <section>
            <b>Топ-теги:</b> {renderPills(debug.topTags)}
          </section>
          <details>
            <summary>
              Запросы к API ({debug.favQueries.length + debug.tagQueries.length}
              )
            </summary>
            <ul className={styles.qList}>
              {[...debug.favQueries, ...debug.tagQueries].map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
            {debug.filterPart && (
              <code className={styles.filterLine}>{debug.filterPart}</code>
            )}
          </details>
          <details>
            <summary>Частоты тегов</summary>
            <pre>{JSON.stringify(debug.freq, null, 2)}</pre>
          </details>
          <details>
            <summary>Пояснение для книг</summary>
            <ul className={styles.bookExplain}>
              {books.map((b) => (
                <li key={b.id}>
                  <b>{b.title.pretty || b.title.english}</b>
                  {b.explain?.slice(0, 3).map((e, i) => (
                    <span key={i} dangerouslySetInnerHTML={{ __html: e }} />
                  ))}
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </div>
  );
};
/* ---------- конец debug-панели ---------- */

const LS_FAVORITES_KEY = "bookFavorites";
const LS_PREFERENCES_KEY = "recommendationPreferences";
const PER_PAGE = 100;
const TODAY_ISO = new Date().toISOString().slice(0, 10);
const isToday = (iso: string) => iso.startsWith(TODAY_ISO);

const SearchResultsRecommendations: React.FC = () => {
  const { selectedTags } = useTagFilter();

  const [favIds, setFavIds] = useState<number[]>(() =>
    JSON.parse(localStorage.getItem(LS_FAVORITES_KEY) ?? "[]")
  );
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_FAVORITES_KEY) {
        setFavIds(JSON.parse(e.newValue ?? "[]"));
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const toggleFavorite = (id: number, add: boolean) => {
    setFavIds((prev) => {
      const next = add ? [...prev, id] : prev.filter((i) => i !== id);
      localStorage.setItem(LS_FAVORITES_KEY, JSON.stringify(next));
      return next;
    });
  };

  const [preferences] = useState<Preferences>(() =>
    JSON.parse(
      localStorage.getItem(LS_PREFERENCES_KEY) ??
        JSON.stringify({
          prioritizeRecency: false,
          prioritizeArtists: true,
          prioritizeCharacters: true,
          diversityLevel: 1,
        })
    )
  );

  const [books, setBooks] = useState<BookWithTags[]>([]);
  const [debug, setDebug] = useState<RecommendationDebugData | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{
    message: string;
    percent: number;
  } | null>(null);

  const lastFetchRef = useRef<{ tagsKey: string; page: number } | null>(null);

  const fetchPage = useCallback(
    (p: number) => {
      if (!favIds.length) return;
      const tagsKey = selectedTags.map((t) => t.id).join(",");
      if (
        lastFetchRef.current &&
        lastFetchRef.current.tagsKey === tagsKey &&
        lastFetchRef.current.page === p
      ) {
        return;
      }
      lastFetchRef.current = { tagsKey, page: p };

      if (p === 1) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      setError(null);

      const unsub = wsClient.subscribe((res) => {
        if (res.type === "recommendations-progress") {
          setProgress({
            percent: res.percent ?? 0,
            message: res.message ?? "",
          });
          return;
        }
        if (res.type === "error") {
          setError(res.message || "Failed to load recommendations");
          setLoading(false);
          setLoadingMore(false);
          return unsub();
        }
        if (res.type === "recommendations-reply") {
          setDebug(res.debug || null);
          setProgress(null);
          setTotalPages(res.totalPages ?? 1);
          setCurrentPage(res.currentPage ?? p);

          const inc: BookWithTags[] = res.books || [];
          const today = inc.filter((b) => isToday(b.uploaded));
          const rest = inc.filter((b) => !isToday(b.uploaded));
          const batch = [...today, ...rest];

          setBooks((prev) => (p === 1 ? batch : [...prev, ...batch]));

          setLoading(false);
          setLoadingMore(false);
          unsub();
        }
      });

      wsClient.send({
        type: "get-recommendations",
        sentIds: [],
        ids: favIds,
        page: p,
        perPage: PER_PAGE,
        preferences,
        filterTags: selectedTags,
      });
    },
    [favIds, preferences, selectedTags]
  );

  // первая загрузка и при смене фильтра
  useEffect(() => {
    if (favIds.length) {
      // всегда вручную сбрасываем на первую страницу при смене тэгов
      lastFetchRef.current = null;
      setBooks([]);
      fetchPage(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTags]);

  // infinite scroll
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!sentinel.current) return;
    const io = new IntersectionObserver(
      ([el]) => {
        if (el.isIntersecting && !loadingMore && currentPage < totalPages) {
          fetchPage(currentPage + 1);
        }
      },
      { rootMargin: "200px" }
    );
    io.observe(sentinel.current);
    return () => io.disconnect();
  }, [loadingMore, currentPage, totalPages, fetchPage]);

  const onRefresh = () => {
    lastFetchRef.current = null;
    setBooks([]);
    fetchPage(1);
  };

  return (
    <div className={styles.container}>
      <main className={styles.mainContent}>
        <RecommendationDebug debug={debug} books={books} />

        {error && (
          <StateBlock
            icon="⚠️"
            title="Error"
            description={error}
            retry={onRefresh}
          />
        )}

        {loading && books.length === 0 && <Loading progress={progress} />}

        {!loading && !error && (
          <>
            <div className={styles.booksGrid}>
              {books.map((b) => (
                <BookCard
                  key={b.id}
                  book={b}
                  isNew={isToday(b.uploaded)}
                  isFavorite={favIds.includes(b.id)}
                  onToggleFavorite={toggleFavorite}
                />
              ))}
            </div>

            {loadingMore && (
              <div className={styles.loadingMore}>Загрузка ещё…</div>
            )}

            {books.length === 0 && favIds.length > 0 && (
              <StateBlock icon="📚" description="No recommendations." />
            )}
            {!favIds.length && (
              <StateBlock icon="📚" description="No favorite books." />
            )}
            <div ref={sentinel} style={{ height: 1 }} />
          </>
        )}
      </main>

      <MinimalHeader
        sortOptions={[]}
        defaultSort=""
        onSortChange={() => {}}
        onRefresh={onRefresh}
        loading={loading}
        showInfo={true}
        disabled={!favIds.length}
      />
    </div>
  );
};

export default SearchResultsRecommendations;
