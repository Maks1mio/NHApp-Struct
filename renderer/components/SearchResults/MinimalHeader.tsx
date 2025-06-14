// MinimalHeader.tsx
import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FiInfo, FiChevronDown } from "react-icons/fi";
import Tooltip from "../ui/Tooltip";
import * as styles from "./SearchResults.module.scss";
import { FaRedo } from "react-icons/fa";
import { motion, AnimatePresence } from "framer-motion";

interface MinimalHeaderProps {
  sortOptions: { value: string; label: string; icon: React.ReactNode }[];
  defaultSort: string;
  onSortChange: (sort: string) => void;
  onRefresh: () => void;
  loading: boolean;
  showInfo?: boolean;
  disabled?: boolean;
}

const MinimalHeader: React.FC<MinimalHeaderProps> = ({
  sortOptions,
  defaultSort,
  onSortChange,
  onRefresh,
  loading,
  showInfo = false,
  disabled = false,
}) => {
  const { search } = useLocation();
  const navigate = useNavigate();
  const qp = new URLSearchParams(search);
  const sortFromURL = qp.get("sort") || defaultSort;

  const [sortState, setSortState] = useState(sortFromURL);
  const [showSorts, setShowSorts] = useState(false);
  const [tipOpen, setTipOpen] = useState(false);
  const infoRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSortState(sortFromURL);
  }, [sortFromURL]);

  const handleSortChange = (value: string) => {
    if (value === sortState) return;
    setSortState(value);
    onSortChange(value);
    qp.set("sort", value);
    qp.set("page", "1");
    navigate(`?${qp.toString()}`);
    setShowSorts(false);
  };

  const icon = (sort: string) => {
    const option = sortOptions.find((o) => o.value === sort);
    return option?.icon || null;
  };

  return (
    <div className={styles.minimalHeader}>
      <div className={styles.sortControls}>
        {/* Показываем селект только если есть опции */}
        {sortOptions.length > 0 && (
          <div
            className={styles.contentTypeSelect}
            onClick={() => setShowSorts((s) => !s)}
          >
            <div className={styles.selectedContentType}>
              {icon(sortState)}
              <span className={styles.badgeContainer}>
                {sortOptions.find((o) => o.value === sortState)?.label}
              </span>
              <FiChevronDown
                className={`${styles.chevron} ${
                  showSorts ? styles.rotated : ""
                }`}
              />
            </div>

            <AnimatePresence>
              {showSorts && (
                <motion.div
                  className={styles.contentTypeDropdown}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.15 }}
                >
                  {sortOptions.map((option) => (
                    <div
                      key={option.value}
                      className={`${styles.contentTypeOption} ${
                        sortState === option.value ? styles.active : ""
                      }`}
                      onClick={() => handleSortChange(option.value)}
                    >
                      {option.icon}
                      <span className={styles.badgeContainer}>
                        {option.label}
                      </span>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        <button
          className={styles.refreshButton}
          disabled={loading || disabled}
          onClick={onRefresh}
        >
          <FaRedo
            className={`${styles.refreshIcon} ${loading ? styles.spin : ""}`}
          />
        </button>
      </div>
    </div>
  );
};

export default MinimalHeader;
