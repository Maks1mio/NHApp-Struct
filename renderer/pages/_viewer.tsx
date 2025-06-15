import { useEffect, useState, useCallback, useRef } from "react";
import * as styles from "./_viewer.module.scss";

import {
  FaTimes,
  FaWindowMinimize,
  FaWindowMaximize,
  FaChevronLeft,
  FaChevronRight,
  FaSyncAlt,
  FaDownload,
  FaColumns,
  FaListAlt,
} from "react-icons/fa";

/* ---------- разбор query ---------- */
function readStartup() {
  const q = new URLSearchParams(window.location.search);
  return {
    bookId: Number(q.get("bookId")) || 0,
    start: Number(q.get("index") ?? 0) || 0,
    title: q.get("title") || undefined,
  };
}

/* ---------- Viewer ---------- */
export default function ViewerApp() {
  const { bookId, start, title } = readStartup();

  // ── state ────────────────────────────────────────────────────────────────
  const [idx, setIdx] = useState(start);
  const [angle, setAngle] = useState(0); // 0 / 90 / 180 / 270
  const [zoom, setZoom] = useState(1); // 0.5 – 5
  const [dual, setDual] = useState(false); // две страницы
  const [longlist, setLonglist] = useState(false); // вертикальная лента
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [pages, setPages] = useState<{ page: number; url: string }[]>([]);
  const [totalPages, setTotalPages] = useState(0);

  const dragStart = useRef({ x: 0, y: 0 });
  const ws = useRef<WebSocket | null>(null);
  const listRef = useRef<HTMLDivElement>(null); // контейнер long‑list

  // бесконечная подгрузка
  const batchSize = 20;
  const lastLoadedPage = useRef(0);

  // ── title ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (title) document.title = title;
  }, [title]);

  // ── WebSocket ────────────────────────────────────────────────────────────
  useEffect(() => {
    ws.current = new WebSocket("ws://localhost:8080");

    ws.current.onopen = () => {
      fetchPages(start + 1, start + 5); // пред‑загрузка
    };

    ws.current.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "book-pages-reply") {
        setPages((prev) => {
          const merged = [...prev, ...msg.pages];
          const uniq = Array.from(
            new Map(merged.map((p) => [p.page, p])).values()
          );
          return uniq.sort((a, b) => a.page - b.page);
        });
        setTotalPages(msg.totalPages);
      }
    };

    return () => ws.current?.close();
  }, []);

  // ── helpers ──────────────────────────────────────────────────────────────
  const fetchPages = useCallback(
    (s: number, e: number) => {
      if (e < s) return;
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(
          JSON.stringify({
            type: "get-book-pages",
            id: bookId,
            startPage: s,
            endPage: e,
          })
        );
      }
    },
    [bookId]
  );

  // preload ±4 (обычные режимы)
  useEffect(() => {
    if (longlist) return;
    const rng = 4;
    const s = Math.max(1, idx + 1 - rng);
    const e = Math.min(totalPages, idx + 1 + rng);
    fetchPages(s, e);
    pages
      .filter((p) => p.page >= s && p.page <= e)
      .forEach((p) => {
        const img = new Image();
        img.src = p.url;
      });
  }, [idx, pages, totalPages, fetchPages, longlist]);

  // initial long‑list
  useEffect(() => {
    if (!longlist || !totalPages) return;
    if (lastLoadedPage.current === 0) {
      // Загружаем страницы, начиная с текущей (idx + 1)
      const currentPage = idx + 1;
      const startPage = Math.max(1, currentPage - Math.floor(batchSize / 2));
      const endPage = Math.min(startPage + batchSize - 1, totalPages);
      fetchPages(startPage, endPage);
      lastLoadedPage.current = endPage;

      // Прокрутка до текущей страницы после загрузки
      if (listRef.current) {
        const img = listRef.current.querySelector(
          `img[alt="Page ${currentPage}"]`
        );
        if (img) {
          img.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
    }
  }, [longlist, totalPages, fetchPages, idx]);

  // scroll listener for long‑list container
  useEffect(() => {
    if (!longlist) return;
    const el = listRef.current;
    if (!el) return;

    const onScroll = () => {
      const { scrollTop, clientHeight, scrollHeight } = el;
      if (
        scrollHeight - scrollTop - clientHeight < 800 &&
        lastLoadedPage.current < totalPages
      ) {
        const ns = lastLoadedPage.current + 1;
        const ne = Math.min(ns + batchSize - 1, totalPages);
        fetchPages(ns, ne);
        lastLoadedPage.current = ne;
      }
    };

    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [longlist, totalPages, fetchPages]);

  // ── навигация ────────────────────────────────────────────────────────────
  const rotateCW = () => setAngle((a) => (a + 90) % 360);
  const toggleDual = () => setDual((d) => !d);
  const toggleLonglist = () => {
    setLonglist((l) => {
      const newLonglist = !l;
      if (newLonglist) {
        // При включении longlist сбрасываем lastLoadedPage, чтобы триггернуть загрузку
        lastLoadedPage.current = 0;
      }
      return newLonglist;
    });
    setDual(false);
    setZoom(1);
    setAngle(0);
    setOffset({ x: 0, y: 0 });
  };

  const next = useCallback(() => {
    setIdx((i) => (i + (dual ? 2 : 1)) % totalPages);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, [dual, totalPages]);

  const prev = useCallback(() => {
    setIdx((i) => (i - (dual ? 2 : 1) + totalPages) % totalPages);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, [dual, totalPages]);

  // ── keys & wheel ────────────────────────────────────────────────────────
  const wheelBlock = useRef(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") window.close();

      if (longlist) {
        const el = listRef.current;
        if (!el) return;
        return;
      }

      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
      if (e.key.toLowerCase() === "r") rotateCW();
      if (e.key.toLowerCase() === "d") toggleDual();
    };

    const onWheel = (e: WheelEvent) => {
      if (longlist) return; // естественный скролл

      if (e.ctrlKey) {
        e.preventDefault();
        const nz = Math.min(5, Math.max(0.5, zoom - e.deltaY * 0.001));
        setZoom(nz);
        if (nz <= 1) setOffset({ x: 0, y: 0 });
        return;
      }
      if (wheelBlock.current) return;
      wheelBlock.current = true;
      e.deltaY > 0 ? next() : prev();
      setTimeout(() => (wheelBlock.current = false), 160);
    };

    window.addEventListener("keydown", onKey);
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("wheel", onWheel);
    };
  }, [next, prev, zoom, longlist]);

  // ── drag (zoom>1) ────────────────────────────────────────────────────────
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1 || longlist) return;
    e.preventDefault();
    setIsDragging(true);
    dragStart.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setOffset({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y,
    });
  };
  const handleMouseUp = () => setIsDragging(false);

  // ── touch gestures for pinch-to-zoom ─────────────────────────────────────
  useEffect(() => {
    const el = listRef.current;
    if (!el || longlist) return;

    let lastDistance = 0;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastDistance = Math.sqrt(dx * dx + dy * dy);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const scaleChange = distance / lastDistance;
        setZoom((prev) => Math.min(5, Math.max(0.5, prev * scaleChange)));
        lastDistance = distance;
      }
    };

    el.addEventListener("touchstart", handleTouchStart);
    el.addEventListener("touchmove", handleTouchMove);
    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
    };
  }, [longlist]);

  // ── download ────────────────────────────────────────────────────────────
  const downloadCurrent = () => {
    const cur = pages.find((p) => p.page === idx + 1);
    if (!cur) return;
    const a = document.createElement("a");
    a.href = cur.url;
    a.download = `page-${idx + 1}`;
    a.click();
  };

  // render
  if (!bookId || !pages.length)
    return (
      <div className={styles.stub} role="status" aria-label="Loading">
        Loading...
      </div>
    );

  const currentPage = pages.find((p) => p.page === idx + 1);
  const secondPage = pages.find((p) => p.page === idx + 2);
  const showDual = dual && secondPage && idx + 1 !== totalPages;

  return (
    <>
      <div className={styles.overlay} aria-hidden="true" />
      <header className={styles.titleBar} role="banner">
        {title || "Viewer"}
      </header>
      {!longlist && (
        <>
          <button
            className={`${styles.nav} ${styles.left}`}
            onClick={prev}
            tabIndex={0}
            aria-label="Previous page"
          >
            <FaChevronLeft />
          </button>
          <button
            className={`${styles.nav} ${styles.right}`}
            onClick={next}
            tabIndex={0}
            aria-label="Next page"
          >
            <FaChevronRight />
          </button>
        </>
      )}
      <div className={styles.info} aria-live="polite">
        {longlist
          ? "Long-list mode"
          : `${idx + 1}${showDual ? `-${idx + 2}` : ""}/${totalPages} | Zoom ${(
              zoom * 100
            ).toFixed(0)}%`}
      </div>
      <div className={styles.tools} role="toolbar">
        {!longlist && (
          <>
            <button
              onClick={rotateCW}
              tabIndex={0}
              aria-label="Rotate clockwise"
              title="Rotate"
            >
              <FaSyncAlt />
            </button>
            <button
              onClick={downloadCurrent}
              tabIndex={0}
              aria-label="Download current page"
              title="Download"
            >
              <FaDownload />
            </button>
            <button
              className={dual ? styles.active : ""}
              onClick={toggleDual}
              tabIndex={0}
              aria-label="Toggle dual page mode"
              title="Dual page"
            >
              <FaColumns />
            </button>
          </>
        )}
        <button
          className={longlist ? styles.active : ""}
          onClick={toggleLonglist}
          tabIndex={0}
          aria-label="Toggle long-list mode"
          title="Long-list"
        >
          <FaListAlt />
        </button>
      </div>
      {longlist ? (
        <main
          className={`${styles.stage} ${styles.longlist}`}
          ref={listRef}
          role="main"
        >
          <div className={styles.longlistContainer}>
            {pages.map((p) => (
              <img
                key={p.page}
                src={p.url}
                draggable={false}
                alt={`Page ${p.page}`}
                loading="lazy"
              />
            ))}
          </div>
        </main>
      ) : (
        <main
          className={styles.stage}
          onClick={(e) => {
            if (e.target === e.currentTarget) window.close();
          }}
          role="main"
        >
          <figure
            className={showDual ? styles.dual : ""}
            style={{
              transform: `rotate(${angle}deg) scale(${zoom}) translate(${offset.x}px,${offset.y}px)`,
              cursor: zoom > 1 ? "grab" : "default",
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            role="img"
            aria-label={`Page ${idx + 1}${showDual ? ` and ${idx + 2}` : ""}`}
          >
            {currentPage && (
              <img
                src={currentPage.url}
                draggable={false}
                alt={`Page ${idx + 1}`}
              />
            )}
            {showDual && secondPage && (
              <img
                src={secondPage.url}
                draggable={false}
                alt={`Page ${idx + 2}`}
              />
            )}
          </figure>
        </main>
      )}
    </>
  );
}
