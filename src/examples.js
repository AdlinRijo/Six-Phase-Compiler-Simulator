export const examples = [
  { id: 'arithmetic', label: 'Arithmetic', source: `int a = 5;\nint b = 3;\nint c = a + b * 2;\nreturn c;` },
  { id: 'nested', label: 'Nested expressions', source: `int a = 2;\nint b = 3;\nint c = (a + b) * (a + b);\nreturn c;` },
  { id: 'if-else', label: 'If / else', source: `int score = 82;\nint grade = 0;\nif (score >= 60) {\n  grade = 1;\n} else {\n  grade = 0;\n}\nreturn grade;` },
  { id: 'loops', label: 'Loops', source: `int total = 0;\nint i = 0;\nwhile (i < 5) {\n  total = total + i;\n  i = i + 1;\n}\nreturn total;` },
  { id: 'undeclared', label: 'Undeclared variable', source: `int result = missing + 1;\nreturn result;` },
  { id: 'syntax', label: 'Syntax error', source: `int value = 10\nreturn value;` },
  { id: 'constant-folding', label: 'Constant folding', source: `int answer = 2 + 3 * 4;\nreturn answer;` },
  { id: 'common-subexpression', label: 'Common subexpression elimination', source: `int a = 4;\nint b = 7;\nint c = a * b + a * b;\nreturn c;` }
];

export const starterSource = examples[0].source;
