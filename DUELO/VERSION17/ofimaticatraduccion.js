/*LAS REGLAS SON LAS SIGUIENTES:

1-MAYUSCULAS Y SIN ACENTOS:LAS PALABRAS SE ESCRIBIRAN EN MAYUSCULAS Y SIN ACENTOS
ejemplo   'QNEXT': 'QNED',


2-LETRAS A LA IZQUIERDA Y NUMEROS A LA DERECHA:SI SON NUMEROS LA VERSION DE CIFRA SE PONDRA A LA DERECHA Y LA LETRA A LA IZQUIERDA
ejemplo  'CINCUENTA Y CINCO': '55'


3-SUSTITUCION: SI DETECTA LA PALABRA DE LA IZQUIERDA LA SUSTITUYE POR LA DE LA  DERECHA  Y LA PONE EN EL BUSCADOR
ejemplo variable 'CINCUENTA':'50'  si digo Cincuenta al microfono me escribira 50


4-DETECCION DIRECTA: SI DETECTA LA PALABRA DE LA DERECHA, LA TOMA DIRECTAMENTE COMO BUENA Y LA PONE EN EL BUSCADOR
ejemplo variable 'CINCUENTA':'50'  si el microfono me detecta 50 me escribira 50


5-SOLO PALABRAS Y FRASES COMPLETAS: SI EN LA IZQUIERA PONEMOS UNA FRASE, A NO SER QUE LA ESCUCHE ENTERA NO LA ESCRIBIRA EN EL BUSCADOR
ejemplo variable  'CHURROS CON CHOCOLATE':'67', si digo churros no escribe nada, pero si digo churros con chocolate escribirá 67




*/
const palabrasclave = {
       'CIENTO CUARENTA Y CUATRO':'144',
       'SAMSUNG':'SAMSUNG',
       'OPPOS':'OPPO',
       'VIVOS':'VIVO',
       'REALME':'REAL',
       'REDMI':'REDMI',
       'XIAOMI':'XIA',
       'LENOVO':'LENO',
       'TCL':'TCL',
       'IPHONE':'IPHO',
       'IMPRESORA':'IMP',
       'CANON':'CANON',
       'HP':'HP',
       'EPSON':'EPSON',
       'MEDION':'MEDION',
       'HACER':'ACER',
       'SPC':'SPC',
       'ESE PC':'SPC',
       'IPAD':'IPAD',
       'SOBREMESA':'SOBREMESA',
       'CPU':'CPU',
       'WINDOWS':'WIN',
       'PORTATIL':'PORT',
       'CHROME':'CHRO',
       'ASUS':'ASUS',
       'PORTATILES':'PORT',
       'TABLETS':'TABL',
       'TABLAS':'TABL',
       'TELEFONO':'TELE',
       'TELEFONOS':'TELE',
       'MOVIL':'MOV',
       'MOVILES':'MOV'





        

        
        
    };