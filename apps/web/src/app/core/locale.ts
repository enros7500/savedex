import { Injectable, Pipe, PipeTransform, inject, signal } from '@angular/core';
import { Language, languagePreference, translate } from './messages';

@Injectable({providedIn:'root'})
export class LocaleService {
  readonly language = signal<Language>(this.read());
  constructor() { document.documentElement.lang = this.language(); }
  private read(): Language { try { return languagePreference(localStorage.getItem('savedex-language')); } catch { return 'en'; } }
  set(value: string): void {
    this.language.set(languagePreference(value));
    document.documentElement.lang = this.language();
    try { localStorage.setItem('savedex-language', this.language()); } catch { /* Session preference still works. */ }
  }
  text(value: unknown): string { return translate(value, this.language()); }
  day(day: string): string { return new Intl.DateTimeFormat(this.language(),{dateStyle:'long',timeZone:'UTC'}).format(new Date(day+'T12:00:00Z')); }
}
@Pipe({name:'t',pure:false})
export class TranslatePipe implements PipeTransform {
  private readonly locale = inject(LocaleService);
  transform(value: unknown): string { return this.locale.text(value); }
}
