/**
 * CustomerAutocomplete Component
 * Keyboard-first customer selection autocomplete box.
 * Supports Marathi typing, English transliteration, and fuzzy search matching.
 */

import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { applyFuzzyFilter } from '../utils/fuzzySearch';
import { getTransliterationSuggestions } from '../utils/transliterate';

const CustomerAutocomplete = forwardRef(function CustomerAutocomplete(
  {
    customers = [],
    selectedCustomer = null,
    onSelectCustomer,
    placeholder = 'Type customer name or mobile...',
    hasError = false,
    id = 'customer-autocomplete-input'
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

  // Synchronize initial or external customer selection
  useEffect(() => {
    if (selectedCustomer) {
      setQuery(selectedCustomer.name);
    }
  }, [selectedCustomer]);

  // Generate fuzzy customer matches
  const filteredCustomers = applyFuzzyFilter(customers, query, ['name', 'mobile']);

  // Generate Marathi transliteration pills for query
  useEffect(() => {
    if (query && query.trim()) {
      const pills = getTransliterationSuggestions(query);
      setTranslitPills(pills || []);
    } else {
      setTranslitPills([]);
    }
  }, [query]);

  // Adjust highlight index bounds
  useEffect(() => {
    if (highlightedIndex >= filteredCustomers.length) {
      setHighlightedIndex(Math.max(0, filteredCustomers.length - 1));
    }
  }, [filteredCustomers, highlightedIndex]);

  function handleInputChange(e) {
    const val = e.target.value;
    setQuery(val);
    setIsOpen(true);
    setHighlightedIndex(0);
    if (!val) {
      onSelectCustomer(null);
    }
  }

  function handleSelect(customer) {
    onSelectCustomer(customer);
    setQuery(customer.name);
    setIsOpen(false);
  }

  function handleKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else {
        setHighlightedIndex((prev) => (prev + 1) % Math.max(1, filteredCustomers.length));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (isOpen) {
        setHighlightedIndex((prev) => (prev - 1 + filteredCustomers.length) % Math.max(1, filteredCustomers.length));
      }
    } else if (e.key === 'Enter') {
      if (isOpen && filteredCustomers.length > 0 && highlightedIndex >= 0) {
        e.preventDefault();
        e.stopPropagation();
        const chosen = filteredCustomers[highlightedIndex];
        if (chosen) {
          handleSelect(chosen);
        }
      } else if (selectedCustomer) {
        // If customer is already selected, pass Enter event to parent form flow
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  }

  // Close dropdown on outside click
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

      {/* Marathi Transliteration Hint Pills */}
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

      {/* Autocomplete Dropdown List */}
      {isOpen && filteredCustomers.length > 0 && (
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
          {filteredCustomers.map((cust, idx) => (
            <li
              key={cust.id}
              onClick={() => handleSelect(cust)}
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
              <span style={{ fontWeight: 600, color: '#0f172a' }}>{cust.name}</span>
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{cust.mobile}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});

export default CustomerAutocomplete;
