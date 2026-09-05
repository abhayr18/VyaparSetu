/**
 * VegetableAutocomplete Component
 * Keyboard-first vegetable selection autocomplete box.
 * Supports Marathi typing, transliteration, search keywords, and fuzzy matching.
 */

import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { applyFuzzyFilter } from '../utils/fuzzySearch';
import { getTransliterationSuggestions } from '../utils/transliterate';

const VegetableAutocomplete = forwardRef(function VegetableAutocomplete(
  {
    vegetables = [],
    selectedVegetable = null,
    onSelectVegetable,
    placeholder = 'Type vegetable (e.g. kanda, shev)...',
    hasError = false,
    id = 'vegetable-autocomplete-input',
    onNavigateNext,
    onNavigatePrev
  },
  ref
) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [translitPills, setTranslitPills] = useState([]);

  const inputRef = useRef(null);
  const dropdownRef = useRef(null);

  useImperativeHandle(ref, () => ({
    focus: () => {
      inputRef.current?.focus();
    },
    select: () => {
      inputRef.current?.select();
    },
    clear: () => {
      setQuery('');
      setIsOpen(false);
    }
  }));

  useEffect(() => {
    if (selectedVegetable) {
      setQuery(selectedVegetable.name);
    }
  }, [selectedVegetable]);

  const filteredVegetables = applyFuzzyFilter(vegetables, query, ['name', 'search_keywords']);

  useEffect(() => {
    if (query && query.trim()) {
      const pills = getTransliterationSuggestions(query);
      setTranslitPills(pills || []);
    } else {
      setTranslitPills([]);
    }
  }, [query]);

  useEffect(() => {
    if (highlightedIndex >= filteredVegetables.length) {
      setHighlightedIndex(Math.max(0, filteredVegetables.length - 1));
    }
  }, [filteredVegetables, highlightedIndex]);

  function handleInputChange(e) {
    const val = e.target.value;
    setQuery(val);
    setIsOpen(true);
    setHighlightedIndex(0);
    if (!val) {
      onSelectVegetable(null);
    }
  }

  function handleSelect(vegetable) {
    onSelectVegetable(vegetable);
    setQuery(vegetable.name);
    setIsOpen(false);
  }

  function handleKeyDown(e) {
    if (e.key === 'ArrowDown') {
      if (!isOpen || filteredVegetables.length === 0) {
        if (onNavigateNext) {
          e.preventDefault();
          onNavigateNext();
        } else {
          setIsOpen(true);
        }
      } else {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev + 1) % Math.max(1, filteredVegetables.length));
      }
    } else if (e.key === 'ArrowUp') {
      if (isOpen && filteredVegetables.length > 0) {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev - 1 + filteredVegetables.length) % Math.max(1, filteredVegetables.length));
      } else if (onNavigatePrev) {
        e.preventDefault();
        onNavigatePrev();
      }
    } else if (e.key === 'ArrowRight') {
      const target = e.target;
      const isAtEnd = target.selectionStart === target.selectionEnd && target.selectionStart === target.value.length;
      const isAllSelected = target.selectionStart === 0 && target.selectionEnd === target.value.length;
      if ((isAtEnd || isAllSelected || !isOpen) && onNavigateNext) {
        e.preventDefault();
        setIsOpen(false);
        onNavigateNext();
      }
    } else if (e.key === 'ArrowLeft') {
      const target = e.target;
      const isAtStart = target.selectionStart === 0 && target.selectionEnd === 0;
      const isAllSelected = target.selectionStart === 0 && target.selectionEnd === target.value.length;
      if ((isAtStart || isAllSelected || !isOpen) && onNavigatePrev) {
        e.preventDefault();
        setIsOpen(false);
        onNavigatePrev();
      }
    } else if (e.key === 'Enter') {
      if (isOpen && filteredVegetables.length > 0 && highlightedIndex >= 0) {
        e.preventDefault();
        e.stopPropagation();
        const chosen = filteredVegetables[highlightedIndex];
        if (chosen) {
          handleSelect(chosen);
        }
      } else if (onNavigateNext) {
        e.preventDefault();
        onNavigateNext();
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  }

  useEffect(() => {
    function handleClickOutside(event) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target) &&
        inputRef.current &&
        !inputRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-scroll highlighted item into view
  useEffect(() => {
    if (isOpen && dropdownRef.current) {
      const activeEl = dropdownRef.current.children[highlightedIndex];
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input
          ref={inputRef}
          id={id}
          name="vegetable"
          type="text"
          className={`input-field ${hasError ? 'input-error' : ''}`}
          placeholder={placeholder}
          title={placeholder}
          value={query}
          onChange={handleInputChange}
          onFocus={(e) => {
            e.target.select();
            setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          style={{
            fontSize: '1rem',
            padding: '0.65rem 0.85rem',
            paddingRight: (query || selectedVegetable) ? '2.2rem' : '0.85rem',
            width: '100%',
            borderColor: selectedVegetable ? '#16a34a' : undefined,
            backgroundColor: selectedVegetable ? '#f0fdf4' : undefined,
            fontWeight: selectedVegetable ? 600 : 400
          }}
        />
        {selectedVegetable && !query && (
          <span
            style={{
              position: 'absolute',
              right: '28px',
              fontSize: '0.8rem',
              color: '#16a34a',
              fontWeight: 700,
              pointerEvents: 'none'
            }}
          >
            ✓
          </span>
        )}
        {(query || selectedVegetable) && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              onSelectVegetable(null);
              setIsOpen(true);
              inputRef.current?.focus();
            }}
            style={{
              position: 'absolute',
              right: '8px',
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: '0.9rem',
              padding: '2px 6px',
              borderRadius: '50%',
            }}
            title="Clear / Change vegetable"
          >
            ✕
          </button>
        )}
      </div>

      {translitPills.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
          {translitPills.slice(0, 3).map((pill, idx) => (
            <button
              key={idx}
              type="button"
              className="translit-pill"
              onClick={() => {
                setQuery(pill);
                setIsOpen(true);
                inputRef.current?.focus();
              }}
              style={{
                fontSize: '0.75rem',
                padding: '2px 8px',
                background: '#e0f2fe',
                color: '#0369a1',
                border: '1px solid #bae6fd',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              {pill}
            </button>
          ))}
        </div>
      )}

      {isOpen && filteredVegetables.length > 0 && (
        <ul
          ref={dropdownRef}
          className="autocomplete-dropdown"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 1000,
            maxHeight: '230px',
            overflowY: 'auto',
            background: '#ffffff',
            border: '2px solid #3b82f6',
            borderRadius: '6px',
            boxShadow: '0 12px 24px -4px rgba(0,0,0,0.18)',
            listStyle: 'none',
            margin: '4px 0 0 0',
            padding: 0
          }}
        >
          {filteredVegetables.map((veg, idx) => {
            const isHighlighted = idx === highlightedIndex;
            const isSelected = selectedVegetable?.id === veg.id;

            return (
              <li
                key={veg.id}
                onClick={() => handleSelect(veg)}
                onMouseEnter={() => setHighlightedIndex(idx)}
                style={{
                  padding: '0.65rem 0.95rem',
                  cursor: 'pointer',
                  background: isHighlighted
                    ? '#1d4ed8'
                    : isSelected
                    ? '#eff6ff'
                    : '#ffffff',
                  color: isHighlighted ? '#ffffff' : '#0f172a',
                  borderBottom: '1px solid #e2e8f0',
                  borderLeft: isHighlighted ? '4px solid #60a5fa' : isSelected ? '4px solid #3b82f6' : '4px solid transparent',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  transition: 'background 0.1s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontWeight: isHighlighted || isSelected ? 700 : 600, fontSize: '0.95rem' }}>
                    {veg.name}
                  </span>
                  {isSelected && (
                    <span
                      style={{
                        fontSize: '0.72rem',
                        padding: '1px 6px',
                        background: isHighlighted ? 'rgba(255,255,255,0.25)' : '#dcfce7',
                        color: isHighlighted ? '#ffffff' : '#15803d',
                        borderRadius: '4px',
                        fontWeight: 700
                      }}
                    >
                      ✓ Selected
                    </span>
                  )}
                </div>
                <span
                  style={{
                    fontSize: '0.82rem',
                    color: isHighlighted ? '#ffffff' : '#16a34a',
                    background: isHighlighted ? 'rgba(255,255,255,0.2)' : '#f0fdf4',
                    border: isHighlighted ? '1px solid rgba(255,255,255,0.3)' : '1px solid #bbf7d0',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontWeight: 700
                  }}
                >
                  ₹{veg.rate} /{veg.unit || 'kg'}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
});

export default VegetableAutocomplete;
