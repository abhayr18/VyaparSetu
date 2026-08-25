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
    id = 'vegetable-autocomplete-input'
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
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else {
        setHighlightedIndex((prev) => (prev + 1) % Math.max(1, filteredVegetables.length));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (isOpen) {
        setHighlightedIndex((prev) => (prev - 1 + filteredVegetables.length) % Math.max(1, filteredVegetables.length));
      }
    } else if (e.key === 'Enter') {
      if (isOpen && filteredVegetables.length > 0 && highlightedIndex >= 0) {
        e.preventDefault();
        e.stopPropagation();
        const chosen = filteredVegetables[highlightedIndex];
        if (chosen) {
          handleSelect(chosen);
        }
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

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        className={`input-field ${hasError ? 'input-error' : ''}`}
        placeholder={placeholder}
        value={query}
        onChange={handleInputChange}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        style={{ fontSize: '1rem', padding: '0.65rem 0.85rem' }}
      />

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
            maxHeight: '220px',
            overflowY: 'auto',
            background: 'white',
            border: '1px solid #cbd5e1',
            borderRadius: '6px',
            boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
            listStyle: 'none',
            margin: '4px 0 0 0',
            padding: 0
          }}
        >
          {filteredVegetables.map((veg, idx) => (
            <li
              key={veg.id}
              onClick={() => handleSelect(veg)}
              onMouseEnter={() => setHighlightedIndex(idx)}
              style={{
                padding: '0.6rem 0.85rem',
                cursor: 'pointer',
                background: idx === highlightedIndex ? '#f1f5f9' : 'white',
                borderBottom: '1px solid #f1f5f9',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <span style={{ fontWeight: 600, color: '#0f172a' }}>{veg.name}</span>
              <span style={{ fontSize: '0.8rem', color: '#16a34a', fontWeight: 600 }}>
                ₹{veg.rate} /{veg.unit || 'kg'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});

export default VegetableAutocomplete;
