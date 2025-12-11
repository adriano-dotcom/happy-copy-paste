import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format } from 'date-fns';
import { CalendarIcon, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from './ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Input } from './ui/input';
import { Button } from './Button';
import { Calendar } from './ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { cn } from '../lib/utils';
import { api } from '../services/api';
import { Contact, TeamMember } from '../types';

const dealFormSchema = z.object({
  contact_id: z.string().min(1, { message: 'Selecione um contato' }),
  title: z.string()
    .trim()
    .min(3, { message: 'Título deve ter no mínimo 3 caracteres' })
    .max(100, { message: 'Título deve ter no máximo 100 caracteres' }),
  company: z.string()
    .trim()
    .max(100, { message: 'Empresa deve ter no máximo 100 caracteres' })
    .optional(),
  value: z.coerce.number()
    .min(0, { message: 'Valor deve ser positivo' })
    .max(999999999, { message: 'Valor muito alto' })
    .default(0),
  stage: z.string().default('new'),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  tags: z.string()
    .max(500, { message: 'Tags muito longas' })
    .optional(),
  due_date: z.date().optional(),
  owner_id: z.string().optional(),
});

type DealFormValues = z.infer<typeof dealFormSchema>;

interface CreateDealModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDealCreated: () => void;
}

export const CreateDealModal: React.FC<CreateDealModalProps> = ({
  open,
  onOpenChange,
  onDealCreated,
}) => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<DealFormValues>({
    resolver: zodResolver(dealFormSchema),
    defaultValues: {
      title: '',
      company: '',
      value: 0,
      stage: 'new',
      priority: 'medium',
      tags: '',
    },
  });

  useEffect(() => {
    if (open) {
      // Load contacts and team members
      const loadData = async () => {
        try {
          const [contactsData, teamData] = await Promise.all([
            api.fetchContacts(),
            api.fetchTeam(),
          ]);
          setContacts(contactsData);
          setTeamMembers(teamData);
        } catch (error) {
          console.error('Error loading data:', error);
        }
      };
      loadData();
    }
  }, [open]);

  const onSubmit = async (data: DealFormValues) => {
    setIsSubmitting(true);
    try {
      // Parse tags from comma-separated string
      const tagsArray = data.tags
        ? data.tags.split(',').map(t => t.trim()).filter(t => t.length > 0)
        : [];

      await api.createDeal({
        contact_id: data.contact_id,
        title: data.title,
        company: data.company,
        value: data.value,
        stage: data.stage,
        priority: data.priority,
        tags: tagsArray,
        due_date: data.due_date ? format(data.due_date, 'yyyy-MM-dd') : undefined,
        owner_id: data.owner_id,
      });

      form.reset();
      onOpenChange(false);
      onDealCreated();
    } catch (error) {
      console.error('Error creating deal:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-slate-900 border-slate-800 text-slate-50">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-white">
            Criar Novo Deal
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Preencha as informações para criar uma nova oportunidade no pipeline.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="contact_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-200">Contato *</FormLabel>
                  <Select 
                    onValueChange={(value) => {
                      field.onChange(value);
                      // Auto-preencher dados da empresa quando contato é selecionado
                      const selectedContact = contacts.find(c => c.id === value);
                      if (selectedContact) {
                        if (selectedContact.company) {
                          form.setValue('company', selectedContact.company);
                        }
                        // Auto-preencher título com nome do contato/empresa se vazio
                        const currentTitle = form.getValues('title');
                        if (!currentTitle) {
                          form.setValue('title', selectedContact.company || selectedContact.name || selectedContact.call_name || '');
                        }
                      }
                    }} 
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                        <SelectValue placeholder="Selecione um contato" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      {contacts.map((contact) => (
                        <SelectItem key={contact.id} value={contact.id}>
                          <div className="flex flex-col">
                            <span>{contact.name || contact.call_name || 'Sem nome'}</span>
                            {contact.company && (
                              <span className="text-xs text-slate-400">{contact.company}</span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription className="text-slate-500">
                    Cliente ou lead associado a esta oportunidade
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-200">Título *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Ex: Venda Premium..."
                        className="bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-500"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="company"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-200">Empresa</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Nome da empresa"
                        className="bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-500"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="value"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-200">Valor (R$)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        className="bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-500"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-200">Prioridade</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        <SelectItem value="low">Baixa</SelectItem>
                        <SelectItem value="medium">Média</SelectItem>
                        <SelectItem value="high">Alta</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="due_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel className="text-slate-200">Data Prevista</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              'w-full pl-3 text-left font-normal bg-slate-800 border-slate-700 hover:bg-slate-700',
                              !field.value && 'text-slate-500'
                            )}
                          >
                            {field.value ? (
                              format(field.value, 'dd/MM/yyyy')
                            ) : (
                              <span>Selecione uma data</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 bg-slate-800 border-slate-700" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) => date < new Date()}
                          initialFocus
                          className="pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                    <FormDescription className="text-slate-500">
                      Previsão de fechamento
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="owner_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-200">Responsável</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        {teamMembers.map((member) => (
                          <SelectItem key={member.id} value={member.id}>
                            {member.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="tags"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-200">Tags</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ex: premium, urgente (separadas por vírgula)"
                      className="bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-500"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription className="text-slate-500">
                    Separe múltiplas tags com vírgula
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="shadow-lg shadow-cyan-500/20"
              >
                {isSubmitting ? 'Criando...' : 'Criar Deal'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
