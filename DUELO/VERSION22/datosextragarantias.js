 function _getPrima(tramos, pvp) {
            const t = tramos.find(x => pvp >= x.pvp_min && pvp <= x.pvp_max);
            return t ? t.prima : null;
        }
        const _TV3 = [{pvp_min:0,pvp_max:149.99,prima:29.90},{pvp_min:150,pvp_max:249.99,prima:39.90},{pvp_min:250,pvp_max:349.99,prima:49.90},{pvp_min:350,pvp_max:399.99,prima:59.90},{pvp_min:400,pvp_max:599.99,prima:79.90},{pvp_min:600,pvp_max:699.99,prima:89.90},{pvp_min:700,pvp_max:799.99,prima:109.90},{pvp_min:800,pvp_max:999.99,prima:129.90},{pvp_min:1000,pvp_max:1199.99,prima:159.90},{pvp_min:1200,pvp_max:4000,prima:null}];
        const _GAE3 = [{pvp_min:0,pvp_max:249.99,prima:40},{pvp_min:250,pvp_max:349.99,prima:55},{pvp_min:350,pvp_max:449.99,prima:95},{pvp_min:450,pvp_max:599.99,prima:125},{pvp_min:600,pvp_max:799.99,prima:165},{pvp_min:800,pvp_max:3000,prima:null}];
        const _AA3  = [{pvp_min:0,pvp_max:249.99,prima:40},{pvp_min:250,pvp_max:349.99,prima:50},{pvp_min:350,pvp_max:449.99,prima:60},{pvp_min:450,pvp_max:549.99,prima:70},{pvp_min:550,pvp_max:649.99,prima:80},{pvp_min:650,pvp_max:749.99,prima:90},{pvp_min:750,pvp_max:2000,prima:100}];
        const _PAE2 = [{pvp_min:100,pvp_max:149.99,prima:19.90},{pvp_min:150,pvp_max:299.99,prima:29.90},{pvp_min:350,pvp_max:1000,prima:49.90}];
        const _PAE1 = [{pvp_min:0,pvp_max:99.99,prima:7.99}];
        const _NOM1 = [{pvp_min:0,pvp_max:149.99,prima:29.90},{pvp_min:150,pvp_max:299.99,prima:39.90},{pvp_min:300,pvp_max:499.99,prima:59.90},{pvp_min:500,pvp_max:749.99,prima:79.90},{pvp_min:750,pvp_max:1199.99,prima:109.90},{pvp_min:1200,pvp_max:1799.99,prima:159.90},{pvp_min:1800,pvp_max:2399.99,prima:189.90},{pvp_min:2400,pvp_max:3000,prima:229.90}];

        function calcularExtragarantia(cat, sub, pvpStr) {
            const pvp = parseFloat(pvpStr.replace(',','.'));
            if (isNaN(pvp)) return '—';
            cat = (cat||'').toUpperCase(); sub = (sub||'').toUpperCase();
            let tramos, label;
            if (cat.includes('IMAGEN') || sub.includes('TELEV') || cat.includes('TELEV')) {
                tramos = _TV3; label = '+3a TV';
            } else if (cat.includes('GRAN APARATO') || sub.includes('LAVADORA') || sub.includes('LAVAVAJILL') || sub.includes('COMBI') || sub.includes('FRIGORIFICO') || sub.includes('SECADORA') || sub.includes('HORNO') || sub.includes('MICROONDAS') || sub.includes('CAMPANA') || sub.includes('PLACA') || cat.includes('GAE')) {
                tramos = _GAE3; label = '+3a GAE';
            } else if (sub.includes('AIRE') || sub.includes('ACOND') || cat.includes('AIRE')) {
                tramos = _AA3; label = '+3a AA';
            } else if (cat.includes('OFIM') || sub.includes('PORTATIL') || sub.includes('PORTÁTIL') || sub.includes('TABLET') || sub.includes('CAMARA') || sub.includes('CÁMARA')) {
                tramos = _NOM1; label = 'Extraprot.';
            } else if (pvp < 100) {
                tramos = _PAE1; label = '+1a PAE';
            } else {
                tramos = _PAE2; label = '+2a PAE';
            }
            const prima = _getPrima(tramos, pvp);
            return (prima === null || prima === undefined) ? '—' : label + ': ' + prima.toFixed(2) + '€';
        }
