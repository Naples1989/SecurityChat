/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        telegram: {
          blue: '#24A1DE',
          lightBlue: '#50A2E1',
          darkBlue: '#179CDE',
          gray: '#8E8E93',
          lightGray: '#F1F1F1',
          bg: '#FFFFFF',
          sidebar: '#F4F4F5',
        }
      }
    },
  },
  plugins: [],
}
