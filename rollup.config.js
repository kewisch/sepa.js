import copy from 'rollup-plugin-copy';
import terser from '@rollup/plugin-terser';

export default [{
  input: ['lib/module.js'],
  output: [
    { file: 'dist/sepa.js', format: 'es', exports: 'default', name: 'SEPA' },
    { file: 'dist/sepa.min.js', format: 'es', exports: 'default', name: 'SEPA', plugins: [terser()] },
    { file: 'dist/sepa.es5.js', format: 'umd', exports: 'default', name: 'SEPA' },
    { file: 'dist/sepa.es5.min.js', format: 'umd', exports: 'default', name: 'SEPA', plugins: [terser()] },
  ],
  plugins: [
    copy({
      targets: [
        {src: 'types/sepa.d.ts', dest: 'dist/types'},
      ]
    })
  ]
}];
