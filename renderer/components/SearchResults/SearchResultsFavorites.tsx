import React, { useCallback, useEffect, useRef, useState } from "react";
import BookCard, { Book } from "../BookCard";
import { FiStar, FiTrendingUp } from "react-icons/fi";
import { FaRedo } from "react-icons/fa";
import * as styles from "./SearchResults.module.scss";
import { wsClient } from "../../../wsClient";
import MinimalHeader from "./MinimalHeader";
import { Loading, StateBlock } from "./SearchResultStates";

const PER_PAGE = 25;
const FAVORITES_SORT_KEY = "favoritesSortType";
const LS_FAVORITES_KEY = "bookFavorites";

type SortType = "relevance" | "popular";

const SORT_OPTS: { value: SortType; label: string; icon: React.ReactNode }[] = [
  { value: "relevance", label: "By date added", icon: <FiStar /> },
  { value: "popular", label: "By popularity", icon: <FiTrendingUp /> },
];

const SearchResultsFavorites: React.FC = () => {
  /* ─── локальные избранные ─── */
  const [favIds, setFavIds] = useState<number[]>(() =>
    JSON.parse(localStorage.getItem(LS_FAVORITES_KEY) ?? "[]")
  );
  const favIdsRef = useRef(favIds);
  useEffect(() => {
    favIdsRef.current = favIds;
  }, [favIds]);

  /* ─── данные / состояние ─── */
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setPage] = useState(1);
  const [totalPages, setTotal] = useState(1);

  const initialSort =
    (localStorage.getItem(FAVORITES_SORT_KEY) as SortType) || "relevance";
  const [sortState, setSort] = useState<SortType>(initialSort);

  /* ─── fetch ─── */
  const fetchPage = useCallback(
    (p = 1, s: SortType = sortState) => {
      const ids = favIdsRef.current;
      if (ids.length === 0) {
        setBooks([]);
        setPage(1);
        setTotal(1);
        return;
      }

      p === 1 ? setLoading(true) : setMore(true);
      setError(null);

      const unsub = wsClient.subscribe((res) => {
        if (res.type === "error") {
          setError(res.message || "Unknown error");
          setLoading(false);
          setMore(false);
          return unsub();
        }
        if (res.type === "favorites-reply") {
          setBooks((prev) =>
            p === 1 ? res.books || [] : [...prev, ...(res.books || [])]
          );
          setTotal(res.totalPages ?? 1);
          setPage(res.currentPage ?? p);
          setLoading(false);
          setMore(false);
          unsub();
        }
      });

      wsClient.send({
        type: "get-favorites",
        ids,
        page: p,
        perPage: PER_PAGE,
        sort: s === "popular" ? "popular" : "relevance",
      });
    },
    [sortState]
  );

  /* ─── init ─── */
  useEffect(() => {
    fetchPage(1, initialSort);
  }, [initialSort, fetchPage]);

  /* ─── sort change ─── */
  const onSortChange = (v: string) => {
    localStorage.setItem(FAVORITES_SORT_KEY, v);
    setSort(v as SortType);
    setBooks([]);
    setPage(1);
    fetchPage(1, v as SortType);
  };

  /* ─── toggle ★ ─── */
  const toggleFavorite = (id: number, add: boolean) => {
    setFavIds((prev) => {
      const next = add ? [...prev, id] : prev.filter((i) => i !== id);
      localStorage.setItem(LS_FAVORITES_KEY, JSON.stringify(next));
      if (!add) setBooks((b) => b.filter((bk) => bk.id !== id));
      return next;
    });
  };

  /* ─── infinite scroll ─── */
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!sentinel.current) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !loadingMore && currentPage < totalPages) {
          fetchPage(currentPage + 1);
        }
      },
      { rootMargin: "200px" }
    );
    io.observe(sentinel.current);
    return () => io.disconnect();
  }, [loadingMore, currentPage, totalPages, fetchPage]);

  /* ─── helpers ─── */
  const onRefresh = () => {
    setBooks([]);
    setPage(1);
    fetchPage(1, sortState);
  };

  /* ─── UI ─── */
  return (
    <div className={styles.container}>
      <div className={styles.mainContent}>
        {(error ||
          (!loading &&
            (favIds.length === 0 ||
              (favIds.length > 0 && books.length === 0)))) && (
          <StateBlock
            icon={error ? "⚠️" : favIds.length === 0 ? "📚" : "🔍"}
            title={
              error
                ? "Error"
                : favIds.length === 0
                ? "Your favorites are empty"
                : "Nothing found"
            }
            description={
              error ||
              (favIds.length === 0
                ? "Save the works you like, and they will appear here"
                : "Try changing the sort or filters")
            }
            retry={error ? () => fetchPage(1, sortState) : undefined}
          />
        )}

        {loading && books.length === 0 && <Loading />}

        {!loading && books.length > 0 && (
          <>
            <div className={styles.booksGrid}>
              {books.map((b) => (
                <BookCard
                  key={b.id}
                  book={b}
                  isFavorite={favIds.includes(b.id)}
                  onToggleFavorite={toggleFavorite}
                />
              ))}
            </div>

            {loadingMore && (
              <div className={styles.loadingMore}>Loading more…</div>
            )}

            <div ref={sentinel} style={{ height: 1 }} />
          </>
        )}
      </div>

      <MinimalHeader
        sortOptions={SORT_OPTS}
        defaultSort="relevance"
        onSortChange={onSortChange}
        onRefresh={onRefresh}
        loading={loading}
        disabled={favIds.length === 0}
      />
    </div>
  );
};

export default SearchResultsFavorites;
