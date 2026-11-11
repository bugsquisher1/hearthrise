"""tools/translate-worker.py — offline translation on this PC (Argos Translate), no account, no tokens.

  python tools/translate-worker.py --install        download the language packs listed in PAIRS (once)
  python tools/translate-worker.py                   worker: one JSON per line on stdin -> one JSON per line on stdout
                                                     in:  {"from":"es","to":"en","text":"..."}   ("from":"auto" detects)
                                                     out: {"out":"...","from":"es","ms":123}  or {"error":"..."}
  python tools/translate-worker.py es en "hola"      one translation, printed

Models live under %LOCALAPPDATA%\\argos-translate. Started by tools/board.local.mjs; local tool, not in CI.
"""
import json, sys, time

PAIRS = [('es', 'en'), ('en', 'es'), ('pt', 'en'), ('en', 'pt'), ('de', 'en'), ('en', 'de'), ('fr', 'en'), ('en', 'fr'),
         ('pl', 'en'), ('en', 'pl'), ('ru', 'en'), ('en', 'ru'), ('tr', 'en'), ('en', 'tr'), ('it', 'en'), ('en', 'it')]


def install():
    import argostranslate.package as pkg
    pkg.update_package_index()
    have = {(p.from_code, p.to_code) for p in pkg.get_installed_packages()}
    avail = pkg.get_available_packages()
    for f, t in PAIRS:
        if (f, t) in have:
            print(f'{f}>{t} already installed'); continue
        p = next((a for a in avail if a.from_code == f and a.to_code == t), None)
        if not p:
            print(f'{f}>{t} not offered'); continue
        print(f'{f}>{t} downloading…', flush=True)
        pkg.install_from_path(p.download())
        print(f'{f}>{t} ok', flush=True)


def detect(text):
    """Cheap script/stopword detection for the installed source languages; 'en' when unsure."""
    import re
    if re.search(r'[Ѐ-ӿ]', text): return 'ru'
    low = text.lower()
    words = re.findall(r"[a-zà-ÿğışçöüłśżźńąęć]+", low)
    bag = set(words)
    hints = {
        'es': {'el', 'la', 'los', 'las', 'que', 'es', 'por', 'para', 'con', 'una', 'pero', 'como', 'está', 'hola', 'gracias', 'juego', 'cuando', 'tengo', 'puedo', 'ahora', 'también', 'muy', 'del', 'mi', 'se', 'ya', 'tienda', 'funciona', 'cazar', 'nivel'},
        'pt': {'o', 'os', 'as', 'que', 'não', 'uma', 'para', 'com', 'mas', 'está', 'você', 'obrigado', 'obrigada', 'jogo', 'muito', 'agora', 'pela', 'pelo', 'loja', 'funciona', 'celular', 'também', 'quando', 'eu', 'tenho', 'consigo', 'nível', 'da', 'do', 'na', 'no', 'é'},
        'de': {'der', 'die', 'das', 'und', 'ist', 'nicht', 'ich', 'ein', 'eine', 'mit', 'auch', 'spiel', 'danke', 'wenn', 'kann', 'jetzt', 'aber', 'sehr', 'habe', 'wie', 'für', 'noch', 'jagd', 'level'},
        'fr': {'le', 'la', 'les', 'est', 'pas', 'une', 'pour', 'avec', 'mais', 'je', 'vous', 'merci', 'jeu', 'très', 'quand', 'peux', 'maintenant', 'aussi', 'des', 'du', 'ça', 'sur', 'chasse', 'niveau'},
        'pl': {'jest', 'nie', 'się', 'jak', 'ale', 'tak', 'gra', 'dzięki', 'czy', 'bardzo', 'teraz', 'mogę', 'kiedy', 'też', 'mam', 'gdy', 'sklep', 'działa', 'poziom'},
        'tr': {'bir', 've', 'bu', 'değil', 'için', 'ama', 'oyun', 'çok', 'teşekkürler', 'nasıl', 'şimdi', 'zaman', 'var', 'yok', 'ben', 'da', 'de', 'mağaza', 'çalışıyor', 'seviye'},
        'it': {'il', 'che', 'non', 'una', 'per', 'con', 'sono', 'gioco', 'grazie', 'molto', 'anche', 'quando', 'posso', 'adesso', 'ora', 'ma', 'della', 'negozio', 'funziona', 'livello'},
    }
    # letters that only some of these languages use are strong evidence
    marks = {'es': 'ñ¿¡', 'pt': 'ãõç', 'de': 'ßäöü', 'fr': 'çêèœ', 'pl': 'łśżźńąę', 'tr': 'ğışİ', 'it': 'ì'}
    best, score = 'en', 0
    for code, stop in hints.items():
        n = len(bag & stop) + 3 * sum(low.count(ch) for ch in marks[code])
        if n > score: best, score = code, n
    return best


def translate(src, dst, text):
    import argostranslate.translate as tr
    t0 = time.time()
    if src == 'auto': src = detect(text)
    if src == dst: return {'out': text, 'from': src, 'ms': 0}
    out = tr.translate(text, src, dst)
    return {'out': out, 'from': src, 'ms': int((time.time() - t0) * 1000)}


if __name__ == '__main__':
    a = sys.argv[1:]
    if a[:1] == ['--install']:
        install(); sys.exit(0)
    if len(a) >= 3:
        print(translate(a[0], a[1], ' '.join(a[2:]))['out']); sys.exit(0)
    sys.stdout.reconfigure(encoding='utf-8'); sys.stdin.reconfigure(encoding='utf-8')
    import argostranslate.translate  # noqa: warm the import before the first line
    print(json.dumps({'ready': True}), flush=True)
    for line in sys.stdin:
        try:
            req = json.loads(line)
            res = translate(req.get('from', 'auto'), req.get('to', 'en'), req.get('text', ''))
        except Exception as e:  # noqa
            res = {'error': str(e)}
        print(json.dumps(res, ensure_ascii=False), flush=True)
