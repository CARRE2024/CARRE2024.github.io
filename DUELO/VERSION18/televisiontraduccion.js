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
        'CINCUENTA Y CINCO': '55',
        'TREINTA Y DOS': '32',
        'CUARENTA Y TRES': '43',
        'CUARENTA Y OCHO':'48',
        'CINCUENTA': '50',
        'SESENTA Y CINCO': '65',
        'SETENTA Y CINCO': '75',
        'OCHENTA Y CINCO':'85',
        'VEINTICUATRO': '24',
        'VEINTIOCHO': '28',
        'NOVENTA Y OCHO':'98',
        'CIEN':'100',
        'SETENTA Y SIETE':'77',
        'OCHENTA Y SEIS':'86',
        'HISENSE': 'HISENSE',
        'CIENTO OCHENTA Y OCHO': '188',
        'CULES': 'QLED',
        'CULE': 'QLED',
        'QLED': 'QLED',
        'OLED': 'OLED',
        'OLE': 'OLED',
        'QNEXT': 'QNED',
        'CUNET': 'QNED',
        'MINI LED': 'MINI',
        'SAMSUNG': 'SAMSUNG',
        'TOSHIBA': 'TOSHIBA',
        'LG': 'LG',
        'EJE': 'LG',
        'DAEWOO': 'DAEWOO',
        'PHILIPS': 'PHILIPS',
        'TCL': 'TCL',
        'MANOLO Y PEPE': 'ANTONIO',
        'JAVIER':'HAIER',
        'GUGUEL':'GOOGLE',
        'NANO CELL':'NANO',
        'NANOCELL':'NANO'

        
        
    };