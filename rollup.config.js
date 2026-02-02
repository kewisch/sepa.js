import copy from 'rollup-plugin-copy';
import terser from '@rollup/plugin-terser';


const COPY_TYPES = copy({
  targets: [
    {src: 'types/sepa.d.ts', dest: 'dist/types'},
  ]
});

export default [{
  input: ['lib/module.js'],
  output: [
    { file: 'dist/sepa.js', format: 'es' },
    { file: 'dist/sepa.min.js', format: 'es', plugins: [terser()] },
  ],
  plugins: [COPY_TYPES]
}, {
  input: ['lib/module.commonjs.js'],
  output: [
    { file: 'dist/sepa.es5.cjs', format: 'umd', exports: 'default', name: 'SEPA' },
    { file: 'dist/sepa.es5.min.cjs', format: 'umd', exports: 'default', name: 'SEPA', plugins: [terser()] },
  ],
  plugins: [COPY_TYPES]
}];
