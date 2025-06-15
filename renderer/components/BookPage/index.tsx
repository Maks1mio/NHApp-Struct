import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { wsClient } from "../../../wsClient";
import * as styles from "./BookPage.module.scss";
import {
  FiHeart,
  FiBookOpen,
  FiCalendar,
  FiExternalLink,
  FiCopy,
} from "react-icons/fi";
import { FaHeart } from "react-icons/fa";
import SmartImage from "../SmartImage";
import { useTagFilter } from "../../../context/TagFilterContext";
import ReactCountryFlag from "react-country-flag";
import BookCard from "../BookCard";
import { motion } from "framer-motion";
import { useIsMobile } from "../../../hooks/useIsMobile";

/* ---------- типы ---------- */
interface Tag {
  id: number;
  type: string;
  name: string;
  url: string;
  count: number;
}
interface Book {
  id: number;
  title: { english: string; japanese: string; pretty: string };
  uploaded: string;
  media: number;
  favorites: number;
  pagesCount: number;
  scanlator: string;
  tags: Tag[];
  cover: string;
  thumbnail: string;
  pages: { page: number; url: string; urlThumb: string }[];
}

const TAG_COLORS: Record<string, string> = {
  language: "#FF7D7F",
  artist: "#FB8DF4",
  character: "#F3E17F",
  parody: "#BCEA83",
  group: "#86F0C6",
  category: "#92EFFF",
  tag: "#98a2af",
};
const languageCountryCodes: Record<string, string> = {
  english: "GB",
  chinese: "CN",
  japanese: "JP",
};
const SUPPORTED_LANGUAGES = Object.keys(languageCountryCodes);

/* ---------- компонент ---------- */
const BookPage: React.FC = () => {
  const isMobile = useIsMobile(900);
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { selectedTags, setSelectedTags } = useTagFilter();

  const [book, setBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<number[]>([]);
  const [related, setRelated] = useState<Book[]>([]);

  /* ---------- загрузка ---------- */
  useEffect(() => {
    const storedFav = localStorage.getItem("bookFavorites");
    if (storedFav) setFavorites(JSON.parse(storedFav));

    const unsub = wsClient.subscribe((msg) => {
      if (msg.type === "book-reply") {
        setBook(msg.book);
        setLoading(false);
        wsClient.send({ type: "get-related-books", id: Number(id) });
      } else if (msg.type === "related-books-reply") {
        setRelated(msg.books || []);
      } else if (msg.type === "error") {
        setError(msg.message || "Couldn't load the book");
        setLoading(false);
      }
    });
    wsClient.send({ type: "get-book", id: Number(id) });

    return () => unsub();
  }, [id]);

  /* ---------- избранное ---------- */
  const toggleFavorite = useCallback(() => {
    if (!book) return;
    const updated = favorites.includes(book.id)
      ? favorites.filter((f) => f !== book.id)
      : [...favorites, book.id];
    setFavorites(updated);
    localStorage.setItem("bookFavorites", JSON.stringify(updated));
  }, [book, favorites]);

  /* ---------- теги ---------- */
  const handleTagClick = useCallback(
    (tag: Tag) => {
      const idx = selectedTags.findIndex(
        (t) => Number(t.id) === tag.id && t.name === tag.name
      );
      const next = [...selectedTags];
      idx >= 0 ? next.splice(idx, 1) : next.push(tag);
      setSelectedTags(next);
    },
    [selectedTags, setSelectedTags]
  );

  /* ---------- сортировка тегов ---------- */
  const tagCategories = useMemo(() => {
    if (!book) return [];
    const uniq = book.tags.filter(
      (t, i, arr) =>
        i === arr.findIndex((x) => x.id === t.id && x.name === t.name)
    );
    const defs = [
      {
        type: "language",
        label: "Языки",
        filter: (t: Tag) => SUPPORTED_LANGUAGES.includes(t.name.toLowerCase()),
      },
      {
        type: "artist",
        label: "Артисты",
        filter: (t: Tag) => t.type === "artist",
      },
      {
        type: "character",
        label: "Персонажи",
        filter: (t: Tag) => t.type === "character",
      },
      {
        type: "parody",
        label: "Пародии",
        filter: (t: Tag) => t.type === "parody",
      },
      {
        type: "group",
        label: "Группы",
        filter: (t: Tag) => t.type === "group",
      },
      {
        type: "category",
        label: "Категории",
        filter: (t: Tag) => t.type === "category",
      },
      { type: "tag", label: "Теги", filter: () => true },
    ];
    const used = new Set<number>();
    return defs
      .map((d) => ({
        ...d,
        tags: uniq.filter(
          (t) => !used.has(t.id) && d.filter(t) && used.add(t.id)
        ),
      }))
      .filter((d) => d.tags.length);
  }, [book]);

  /* ---------- копирование ID ---------- */
  const copyId = () => {
    if (!book) return;
    navigator.clipboard.writeText(String(book.id));
  };

  /* ---------- состояния ---------- */
  if (loading)
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loadingSpinner} />
        <p>Загрузка…</p>
      </div>
    );

  if (error || !book)
    return (
      <div className={styles.errorContainer}>
        <div className={styles.error}>{error || "Книга не найдена"}</div>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => navigate(-1)}
          className={styles.backButton}
        >
          Назад
        </motion.button>
      </div>
    );

  const isFav = favorites.includes(book.id);
  const title = book.title.pretty || book.title.english || book.title.japanese;

  /* ---------- render ---------- */
  return (
    <div className={styles.container}>
      <div className={styles.mainSplitLayout}>
        {/* -------- INFO -------- */}
        <aside className={styles.infoPanel}>
          {/* ...левый блок без изменений... */}
          <SmartImage
            src={book.cover || book.thumbnail}
            alt="Обложка"
            className={styles.coverLarge}
          />
          <div className={styles.backgroundOverlayGray} />

          <div className={styles.cardActions}>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={toggleFavorite}
              className={isFav ? styles.favorite : ""}
              title={isFav ? "Убрать из избранного" : "В избранное"}
            >
              {isFav ? <FaHeart /> : <FiHeart />}
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.9 }}
              title="Открыть на nhentai"
              onClick={() =>
                window.open(`https://nhentai.net/g/${book.id}`, "_blank")
              }
            >
              <FiExternalLink />
            </motion.button>
          </div>

          <h1 className={styles.title}>{title}</h1>

          <div className={styles.metaGrid}>
            <div className={styles.metaItem}>
              <FiCalendar className={styles.metaIcon} />
              {new Date(book.uploaded).toLocaleDateString("ru-RU")}
            </div>
            <div className={styles.metaItem}>
              <FiBookOpen className={styles.metaIcon} />
              {book.pagesCount} стр.
            </div>
            <div className={styles.metaItem}>
              <FiHeart className={styles.metaIcon} />
              {book.favorites.toLocaleString()}
            </div>
            <div className={styles.metaItem}>
              <span className={styles.bookId} onClick={copyId}>
                ID: {book.id} <FiCopy />
              </span>
            </div>
          </div>

          {book.scanlator && (
            <div className={styles.scanlatorBlock}>
              Перевод: {book.scanlator}
            </div>
          )}

          {/* -------- TAGS -------- */}
          <div className={styles.tagsBlock}>
            {tagCategories.map(({ type, label, tags }) => (
              <div key={type} className={styles.tagsCategoryRow}>
                <span
                  className={styles.tagsCategoryTitle}
                  style={{ color: TAG_COLORS[type] }}
                >
                  {label}:
                </span>
                <div className={styles.tagsCategoryList}>
                  {tags.map((t) => {
                    const selected = selectedTags.some(
                      (s) => Number(s.id) === t.id && s.name === t.name
                    );
                    return (
                      <motion.span
                        key={t.id}
                        whileTap={{ scale: 0.9 }}
                        className={`${styles.tag} ${
                          selected ? styles.tagSelected : ""
                        }`}
                        style={{
                          color: TAG_COLORS[type],
                          borderColor: TAG_COLORS[type],
                        }}
                        onClick={() => handleTagClick(t)}
                      >
                        {t.name}
                        {type === "language" && (
                          <ReactCountryFlag
                            countryCode={
                              languageCountryCodes[t.name.toLowerCase()]
                            }
                            svg
                            style={{ marginLeft: 4 }}
                          />
                        )}
                      </motion.span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* -------- GALLERY -------- */}
        <main className={styles.galleryPanel}>
          <section className={styles.gallerySection}>
            <h2>Страницы</h2>
            <div className={styles.grid}>
              {book.pages.map((p, idx) => (
                <motion.div
                  key={idx}
                  whileHover={{ scale: 1 }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  className={styles.gridItem}
                  onClick={() =>
                    window.electron.viewer.open(
                      book.id,
                      idx,
                      title
                    )
                  }
                >
                  <SmartImage
                    src={isMobile ? p.url : p.urlThumb || p.url}
                    alt={`Стр. ${idx + 1}`}
                    className={styles.thumbnail}
                    loading="lazy"
                  />
                  <div className={styles.pageNumber}>{idx + 1}</div>
                </motion.div>
              ))}
            </div>
          </section>
        </main>
      </div>

      {/* -------- RELATED -------- */}
      {!!related.length && (
        <section className={styles.relatedBooksSection}>
          <h2>
            Похожие книги <span style={{ fontWeight: 400 }}>[Бета]</span>
          </h2>
          <div className={styles.relatedBooksGrid}>
            {related.map((b) => (
              <BookCard
                key={b.id}
                book={b}
                isFavorite={favorites.includes(b.id)}
                onToggleFavorite={(bid, add) => {
                  const upd = add
                    ? [...favorites, bid]
                    : favorites.filter((i) => i !== bid);
                  setFavorites(upd);
                  localStorage.setItem("bookFavorites", JSON.stringify(upd));
                }}
                className={styles.relatedBookCard}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default BookPage;
