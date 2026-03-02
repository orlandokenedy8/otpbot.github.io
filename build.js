// ============================================
// Build Script — Minify & Obfuscate
// ============================================

const { minify } = require('terser');
const CleanCSS = require('clean-css');
const fs = require('fs');
const path = require('path');

async function build() {
    console.log('🔨 Building production files...\n');

    // ===== MINIFY JS =====
    const jsSource = fs.readFileSync(path.join(__dirname, 'public', 'js', 'app.js'), 'utf8');

    const jsResult = await minify(jsSource, {
        compress: {
            drop_console: false,  // keep console for debugging
            passes: 2,
            dead_code: true,
            collapse_vars: true,
            reduce_vars: true,
        },
        mangle: {
            toplevel: false,  // don't mangle global function names (onclick handlers need them)
            properties: false,
        },
        format: {
            comments: false,
        },
        sourceMap: false,
    });

    if (jsResult.error) {
        console.error('❌ JS minification failed:', jsResult.error);
        return;
    }

    fs.writeFileSync(path.join(__dirname, 'public', 'js', 'app.min.js'), jsResult.code);

    const jsOrigSize = Buffer.byteLength(jsSource);
    const jsMinSize = Buffer.byteLength(jsResult.code);
    console.log(`✅ JS: ${(jsOrigSize / 1024).toFixed(1)}KB → ${(jsMinSize / 1024).toFixed(1)}KB (${Math.round((1 - jsMinSize / jsOrigSize) * 100)}% smaller)`);

    // ===== MINIFY CSS =====
    const cssSource = fs.readFileSync(path.join(__dirname, 'public', 'css', 'styles.css'), 'utf8');

    const cssResult = new CleanCSS({
        level: 2,
        sourceMap: false,
    }).minify(cssSource);

    if (cssResult.errors.length) {
        console.error('❌ CSS minification failed:', cssResult.errors);
        return;
    }

    fs.writeFileSync(path.join(__dirname, 'public', 'css', 'styles.min.css'), cssResult.styles);

    const cssOrigSize = Buffer.byteLength(cssSource);
    const cssMinSize = Buffer.byteLength(cssResult.styles);
    console.log(`✅ CSS: ${(cssOrigSize / 1024).toFixed(1)}KB → ${(cssMinSize / 1024).toFixed(1)}KB (${Math.round((1 - cssMinSize / cssOrigSize) * 100)}% smaller)`);

    console.log('\n🎉 Build complete! Update index.html to use .min files.');
}

build().catch(console.error);
