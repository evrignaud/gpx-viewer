import js from '@eslint/js'
import stylistic from '@stylistic/eslint-plugin'
import globals from 'globals'

export default [
  {
    ignores: ['dist/**', 'electron-dist/**', 'deps/**', 'libs/**']
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        __APP_VERSION__: 'readonly'
      }
    },
    plugins: {
      '@stylistic': stylistic
    },
    rules: {
      // Keeps the original code style of the project: no semicolons and a
      // space between a function name and its parameter list. These rules used
      // to come from aurelia-tools/.eslintrc.json, which no longer exists.
      '@stylistic/semi': ['error', 'never'],
      '@stylistic/space-before-function-paren': ['error', 'always'],
      '@stylistic/indent': ['error', 2],
      '@stylistic/quotes': ['error', 'single', { avoidEscape: true }],
      '@stylistic/comma-dangle': ['error', 'never'],
      '@stylistic/eol-last': ['error', 'always'],
      '@stylistic/no-trailing-spaces': 'error',
      '@stylistic/object-curly-spacing': ['error', 'always'],
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
    }
  },
  {
    // Node-side files: build config and the Electron main process.
    files: ['vite.config.js', 'vitest.config.js', 'eslint.config.js', 'electron-main.js', 'scripts/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  },
  {
    // Unit tests run in jsdom under Vitest.
    files: ['test/*.test.js'],
    languageOptions: {
      globals: {
        ...globals.browser
      }
    }
  },
  {
    // The integration check is an Electron main-process script.
    files: ['test/integration/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  },
  {
    // Loaded as a classic script whose whole job is to report a module bundle
    // that failed to boot, so it deliberately sticks to ES5 syntax.
    files: ['public/boot-diagnostics.js'],
    languageOptions: {
      ecmaVersion: 5,
      sourceType: 'script'
    },
    rules: {
      'no-var': 'off',
      'prefer-const': 'off'
    }
  }
]
