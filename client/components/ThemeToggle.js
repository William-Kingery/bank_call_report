import styles from './ThemeToggle.module.css';

const ThemeToggle = ({ theme, onChange, label = 'Mode' }) => {
  const setTheme = (nextTheme) => {
    if (onChange) {
      onChange(nextTheme);
    }
  };

  return (
    <div className={styles.toggle}>
      <span className={styles.label}>{label}</span>
      <div className={styles.buttons} role="group" aria-label="Display mode">
        <button
          type="button"
          className={`${styles.button} ${theme === 'day' ? styles.buttonActive : ''}`}
          onClick={() => setTheme('day')}
        >
          Day
        </button>
        <button
          type="button"
          className={`${styles.button} ${theme === 'night' ? styles.buttonActive : ''}`}
          onClick={() => setTheme('night')}
        >
          Night
        </button>
      </div>
    </div>
  );
};

export default ThemeToggle;
